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

function DeploymentPointModal({ area, initialPoint, onClose, onConfirm, visible }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const isDark = useDocumentTheme()
  const [point, setPoint] = useState(initialPoint || null)
  const [label, setLabel] = useState(initialPoint?.label || '')

  useEffect(() => {
    if (!visible) return undefined
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, visible])

  useEffect(() => {
    if (!visible || !mapContainerRef.current || !hasMapTilerWebApiKey) return undefined
    const startingPoint = initialPoint || null
    const center = startingPoint || area.referenceCenter
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
      if (startingPoint) updateMarker(startingPoint)
      window.setTimeout(() => map.resize(), 80)
    })
    map.on('click', (event) => updateMarker({
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
    area.referenceCenter,
    initialPoint,
    isDark,
    visible,
  ])

  if (!visible) return null
  const pointInsideCabagan = point
    ? isInsideCabagan(Number(point.latitude), Number(point.longitude))
    : false
  const canConfirm = Boolean(point && pointInsideCabagan && label.trim())

  return createPortal(
    <div className="deployment-point-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="deployment-point-title"
        aria-modal="true"
        className="deployment-point-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="deployment-point-modal__header">
          <div>
            <h3 id="deployment-point-title">Set deployment point</h3>
            <p>{area.name} · {coverageLabelFor(area)}</p>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close deployment point map" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {hasMapTilerWebApiKey ? (
          <div className="deployment-point-map" ref={mapContainerRef} aria-label="Deployment point map" />
        ) : (
          <div className="deployment-point-map deployment-point-map--empty">
            Map configuration is unavailable. Add the MapTiler web key before setting a point.
          </div>
        )}

        <div className="deployment-point-modal__details">
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
        </div>

        <footer className="deployment-point-modal__footer">
          <button type="button" className="assignment-inline-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="report-generate-btn report-generate-btn--assign"
            disabled={!canConfirm}
            onClick={() => onConfirm({ ...point, label: label.trim() })}
          >
            Confirm point
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export default DeploymentPointModal
