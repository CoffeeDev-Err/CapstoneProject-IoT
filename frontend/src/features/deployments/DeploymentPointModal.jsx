import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, X } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../services/configureMapLibre'
import { getMapTilerWebStyleUrl, hasMapTilerWebApiKey } from '../../services/mapTilerWeb'
import { isInsideCabagan } from '../../utils/cabaganGeofence'
import { cabaganBoundaryFeature } from '../../utils/mapLibreLayers'
import { useDocumentTheme } from '../../hooks/useDocumentTheme'
import { coverageLabelFor } from './patrolAreaCatalog'
import { patrolBarangayReferences } from './patrolReferenceCenters'
import { apiRequest } from '../../services/apiClient'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'

const addBoundary = (map) => {
  map.addSource('deployment-cabagan-boundary', {
    type: 'geojson',
    data: cabaganBoundaryFeature,
  })
  map.addLayer({
    id: 'deployment-cabagan-fill',
    type: 'fill',
    source: 'deployment-cabagan-boundary',
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.04 },
  })
  map.addLayer({
    id: 'deployment-cabagan-line',
    type: 'line',
    source: 'deployment-cabagan-boundary',
    paint: { 'line-color': '#dc2626', 'line-width': 2, 'line-dasharray': [2, 2] },
  })
}

function DeploymentPointModal({ area, initialPoint, onClose, onConfirm, visible, radiusMeters, routePoints, readOnly = false, barangay, savedGeometry }) {
  const [loadedBoundary, setBoundary] = useState(null)
  const boundary = savedGeometry || loadedBoundary
  const [boundaryMessage, setBoundaryMessage] = useState(savedGeometry ? 'PSA indicative barangay boundary. Confirm with the LGU.' : 'Loading barangay boundary…')
  useEffect(() => {
    if (!readOnly || !visible || savedGeometry) return undefined
    let active = true
    apiRequest('/api/patrol/boundaries').then(data => {
      if (!active) return
      const feature = data.features?.find(f => f.properties?.barangay === barangay)
      setBoundary(feature?.geometry || null)
      setBoundaryMessage(feature ? data.attribution : 'No boundary available for this barangay. Reference location only; outside-coverage alerts are unavailable.')
    }).catch(() => { if (active) setBoundaryMessage('Boundary unavailable. Reference location only; outside-coverage alerts are unavailable. Reopen this map to retry.') })
    return () => { active = false }
  }, [readOnly, visible, barangay, savedGeometry])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const searchPlaces = async () => {
    if (searching || search.trim().length < 2) return
    setSearching(true); setSearchMessage('')
    const local = patrolBarangayReferences.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()))
      .map(a => ({ label: `${a.name} (reference center; select the exact point)`, ...a.referenceCenter }))
    try {
      const payload = await apiRequest(`/api/patrol/places?q=${encodeURIComponent(search)}`)
      setResults([...payload.places, ...local])
      if (!payload.places.length) setSearchMessage('No exact place found. Select a barangay reference center, then pin the actual place.')
    } catch { setResults(local); setSearchMessage('Place search unavailable. Use a barangay reference center or navigate the map.') }
    finally { setSearching(false) }
  }
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const dialogRef = useAccessibleDialog(visible, onClose, closeButtonRef)
  const isDark = useDocumentTheme()
  const areaLatitude = area.referenceCenter.latitude
  const areaLongitude = area.referenceCenter.longitude
  const initialLatitude = initialPoint?.latitude
  const initialLongitude = initialPoint?.longitude
  const [point, setPoint] = useState(initialPoint || null)
  const [label, setLabel] = useState(initialPoint?.label || '')

  useEffect(() => {
    if (!visible || !mapContainerRef.current || !hasMapTilerWebApiKey) return undefined
    const startingPoint = initialLatitude !== undefined
      && initialLongitude !== undefined
      ? {
          latitude: Number(initialLatitude),
          longitude: Number(initialLongitude),
        }
      : null
    const center = startingPoint || { latitude: areaLatitude, longitude: areaLongitude }
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapTilerWebStyleUrl('street', isDark),
      center: [center.longitude, center.latitude],
      zoom: 15,
      maxZoom: 20,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    const updateMarker = (nextPoint) => {
      setPoint(nextPoint)
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: '#2563eb', draggable: true })
          .setLngLat([nextPoint.longitude, nextPoint.latitude])
          .addTo(map)
        markerRef.current.on('dragend', () => {
          const coordinates = markerRef.current.getLngLat()
          setPoint({ latitude: coordinates.lat, longitude: coordinates.lng })
        })
      } else {
        markerRef.current.setLngLat([nextPoint.longitude, nextPoint.latitude])
      }
    }

    map.on('load', () => {
      addBoundary(map)
      if (startingPoint && !readOnly) updateMarker(startingPoint)
      window.setTimeout(() => map.resize(), 80)
    })
    if (!readOnly) map.on('click', (event) => updateMarker({
      latitude: event.lngLat.lat,
      longitude: event.lngLat.lng,
    }))

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [
    areaLatitude,
    areaLongitude,
    initialLatitude,
    initialLongitude,
    isDark,
    visible,
    readOnly,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || (!radiusMeters && !routePoints?.length && !boundary)) return undefined
    const update = () => {
      const features = []
      if (boundary && readOnly) {
        features.push({ type: 'Feature', properties: {}, geometry: boundary })
        const coordinates = boundary.coordinates.flat(boundary.type === 'MultiPolygon' ? 2 : 1)
        const bounds = new maplibregl.LngLatBounds()
        coordinates.forEach(p => bounds.extend(p))
        map.fitBounds(bounds, { padding: 40, maxZoom: 16 })
      }
      if (radiusMeters && point) {
        const coordinates = Array.from({ length: 65 }, (_, i) => {
          const angle = i / 64 * 2 * Math.PI
          return [point.longitude + Math.cos(angle) * radiusMeters / (111320 * Math.cos(point.latitude * Math.PI / 180)),
            point.latitude + Math.sin(angle) * radiusMeters / 111320]
        })
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } })
      }
      const points = [...(routePoints || []), ...(point ? [point] : [])]
      if (routePoints && points.length > 1) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude]) } })
      const data = { type: 'FeatureCollection', features }
      if (map.getSource('patrol-preview')) map.getSource('patrol-preview').setData(data)
      else {
        map.addSource('patrol-preview', { type: 'geojson', data })
        map.addLayer({ id: 'patrol-preview-fill', type: 'fill', source: 'patrol-preview', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 } })
        map.addLayer({ id: 'patrol-preview-line', type: 'line', source: 'patrol-preview', paint: { 'line-color': '#2563eb', 'line-width': 3, 'line-dasharray': [2, 2] } })
      }
    }
    if (map.isStyleLoaded()) update()
    else map.once('load', update)
    return () => { map.off('load', update) }
  }, [point, radiusMeters, routePoints, visible, boundary, readOnly, isDark])

  if (!visible) return null
  const pointInsideCabagan = point
    ? isInsideCabagan(Number(point.latitude), Number(point.longitude))
    : false
  const canConfirm = Boolean(point && pointInsideCabagan && label.trim())

  return createPortal(
    <div className="deployment-point-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby="deployment-point-title"
        aria-modal="true"
        className="deployment-point-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="deployment-point-modal__header">
          <div>
            <h3 id="deployment-point-title">{readOnly ? 'Barangay coverage' : 'Set deployment point'}</h3>
            <p>{area.name} · {coverageLabelFor(area)}</p>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close deployment point map" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {readOnly ? <p role="status" style={{ padding: '12px 20px' }}>{boundaryMessage}</p> : <div className="deployment-point-search" style={{ padding: '12px 20px' }}>
          <label htmlFor="patrol-map-search">Find a street, place or barangay</label>
          <div style={{ display: 'flex', gap: 8 }}><input id="patrol-map-search" className="settings-input" value={search}
            onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void searchPlaces() } }} />
            <button type="button" disabled={searching || search.trim().length < 2} onClick={searchPlaces}>{searching ? 'Searching…' : 'Search'}</button></div>
          {searchMessage && <p role="status">{searchMessage}</p>}
          {results.length > 0 && <ul style={{ maxHeight: 140, overflow: 'auto' }}>{results.map((result, index) => <li key={index}>
            <button type="button" onClick={() => { mapRef.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 16 }); setResults([]) }}>{result.label}</button>
          </li>)}</ul>}
          {routePoints && <small>The dashed line shows the selected point order. Confirm each actual road or walkway on the map.</small>}
        </div>}

        {hasMapTilerWebApiKey ? (
          <div className="deployment-point-map" ref={mapContainerRef} aria-label="Deployment point map" />
        ) : (
          <div className="deployment-point-map deployment-point-map--empty">
            Map configuration is unavailable. Add the MapTiler web key before setting a point.
          </div>
        )}

        {!readOnly && <div className="deployment-point-modal__details">
          <label>
            <span>Point label</span>
            <input
              className="settings-input"
              maxLength={200}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g., Magassi Barangay Hall entrance"
              value={label}
            />
          </label>
          <div className={`deployment-point-coordinate${point && !pointInsideCabagan ? ' is-error' : ''}`}>
            <MapPin aria-hidden="true" />
            <span>
              {!point
                ? 'Tap the map to place the deployment point.'
                : !pointInsideCabagan
                  ? 'Move the point inside the Cabagan boundary.'
                  : `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`}
            </span>
          </div>
        </div>}

        <footer className="deployment-point-modal__footer">
          <button type="button" className="assignment-inline-btn" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button
            type="button"
            className="report-generate-btn report-generate-btn--assign"
            disabled={!canConfirm}
            onClick={() => onConfirm({ ...point, label: label.trim() })}
          >
            Confirm point
          </button>}
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export default DeploymentPointModal
