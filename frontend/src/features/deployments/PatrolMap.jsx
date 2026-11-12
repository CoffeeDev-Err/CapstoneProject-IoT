import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../services/configureMapLibre'
import { getMapTilerWebStyleUrl, hasMapTilerWebApiKey } from '../../services/mapTilerWeb'
import { useDocumentTheme } from '../../hooks/useDocumentTheme'
import { cabaganBoundaryFeature } from '../../utils/mapLibreLayers'
import { blockTimeLabel, circleGeometry, routeIsEnforced } from './patrolScheduleView'

// Saved road/walking paths and assignment transitions use separate sources.
export default function PatrolMap({ blocks = [], type = 'area', mode = '', start, onPoint, focus, selectedIndex, context = '' }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const pointCallback = useRef(onPoint)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState('')
  const isDark = useDocumentTheme()
  useEffect(() => { pointCallback.current = onPoint }, [onPoint])
  useEffect(() => {
    if (!container.current || !hasMapTilerWebApiKey) return undefined
    let map
    try {
      map = new maplibregl.Map({ container: container.current, style: getMapTilerWebStyleUrl('street', isDark), center: [121.768, 17.427], zoom: 13, attributionControl: false })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
      map.on('click', event => pointCallback.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }))
      map.on('error', () => setMapError('Some map resources could not be loaded. Check your connection and reload to retry.'))
      map.on('load', () => {
        map.addSource('municipality', { type: 'geojson', data: cabaganBoundaryFeature })
        map.addLayer({ id: 'municipality-line', type: 'line', source: 'municipality', paint: { 'line-color': '#64748b', 'line-width': 1.5, 'line-dasharray': [3, 3] } })
        setLoaded(true)
      })
      const observer = new ResizeObserver(() => map.resize())
      observer.observe(container.current)
      return () => { observer.disconnect(); setLoaded(false); map.remove(); mapRef.current = null }
    } catch { queueMicrotask(() => setMapError('The map could not be opened. Check map configuration or reload this page.')); map?.remove() }
  }, [isDark])
  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map) return undefined
    const features = [], transitions = [], markers = []
    const bounds = new maplibregl.LngLatBounds()
    const centers = []
    const addMarker = (coordinates, number, title, isCurrent = false) => {
      if (!coordinates.every(Number.isFinite)) return
      bounds.extend(coordinates)
      const el = document.createElement('button')
      el.type = 'button'; el.className = `patrol-map-marker${isCurrent ? ' is-current' : ''}`; el.textContent = String(number); el.setAttribute('aria-label', title)
      const detail = document.createElement('div'); detail.textContent = title
      const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(detail)
      el.addEventListener('click', event => { event.stopPropagation(); popup.setLngLat(coordinates).addTo(map) })
      markers.push(new maplibregl.Marker({ element: el }).setLngLat(coordinates).setPopup(popup).addTo(map))
    }
    blocks.forEach((block, index) => {
      const title = `${index + 1}. ${block.label || 'Draft'} · ${blockTimeLabel(start, block)} · ${block.durationMinutes} min${context ? ` · ${context}` : ''}`
      const properties = { title, active: selectedIndex === index, corridor: block.routeCorridorMeters ?? 100 }
      if (type === 'route') {
        const points = block.routePoints || []
        const enforced = routeIsEnforced(block, mode)
        const geometry = enforced ? block.geometry : points.length >= 2 ? { type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude]) } : null
        if (geometry) {
          features.push({ type: 'Feature', properties: { ...properties, kind: enforced || mode === 'walk' ? 'route' : 'guide' }, geometry })
          geometry.coordinates.forEach(p => {
            const latitudeMargin = (block.routeCorridorMeters ?? 100) / 111320
            const longitudeMargin = latitudeMargin / Math.cos(p[1] * Math.PI / 180)
            bounds.extend([p[0] - longitudeMargin, p[1] - latitudeMargin])
            bounds.extend([p[0] + longitudeMargin, p[1] + latitudeMargin])
          })
        }
        points.forEach((point, pointIndex) => addMarker([point.longitude, point.latitude], `${index + 1}.${pointIndex + 1}`, `${title} · ${point.label || `Point ${pointIndex + 1}`}`, selectedIndex === index))
        if (points.length) centers.push({ first: [points[0].longitude, points[0].latitude], last: [points.at(-1).longitude, points.at(-1).latitude] })
      } else {
        const geometry = block.coverageType === 'barangay' ? block.geometry : Number.isFinite(block.latitude) && Number.isFinite(block.longitude) ? circleGeometry(block.latitude, block.longitude, block.radiusMeters || 200) : null
        if (geometry) {
          features.push({ type: 'Feature', properties: { ...properties, kind: 'area' }, geometry })
          geometry.coordinates.flat(geometry.type === 'MultiPolygon' ? 2 : 1).forEach(p => bounds.extend(p))
        }
        if (Number.isFinite(block.latitude) && Number.isFinite(block.longitude)) {
          const center = [block.longitude, block.latitude]
          addMarker(center, index + 1, title, selectedIndex === index); centers.push({ first: center, last: center })
        }
      }
    })
    centers.slice(1).forEach((center, index) => transitions.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [centers[index].last, center.first] } }))
    const data = { type: 'FeatureCollection', features }
    const transitionData = { type: 'FeatureCollection', features: transitions }
    if (map.getSource('patrol-blocks')) { map.getSource('patrol-blocks').setData(data); map.getSource('patrol-transitions').setData(transitionData) }
    else {
      map.addSource('patrol-blocks', { type: 'geojson', data })
      map.addSource('patrol-transitions', { type: 'geojson', data: transitionData })
      map.addLayer({ id: 'patrol-area-fill', type: 'fill', source: 'patrol-blocks', filter: ['==', ['get', 'kind'], 'area'], paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.14 } })
      map.addLayer({ id: 'patrol-area-line', type: 'line', source: 'patrol-blocks', filter: ['==', ['get', 'kind'], 'area'], paint: { 'line-color': '#2563eb', 'line-width': 2 } })
      // Meter corridor converted to pixels at this map latitude and zoom.
      map.addLayer({ id: 'patrol-corridor', type: 'line', source: 'patrol-blocks', filter: ['==', ['get', 'kind'], 'route'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-opacity': 0.12, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 0, ['*', ['get', 'corridor'], 2 / (156543.03392 * Math.cos(17.427 * Math.PI / 180))], 22, ['*', ['get', 'corridor'], 2 * 2 ** 22 / (156543.03392 * Math.cos(17.427 * Math.PI / 180))]] } })
      map.addLayer({ id: 'patrol-route-line', type: 'line', source: 'patrol-blocks', filter: ['==', ['get', 'kind'], 'route'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 4 } })
      map.addLayer({ id: 'patrol-guide-line', type: 'line', source: 'patrol-blocks', filter: ['==', ['get', 'kind'], 'guide'], paint: { 'line-color': '#64748b', 'line-width': 2, 'line-dasharray': [2, 2] } })
      map.addLayer({ id: 'patrol-transition-line', type: 'line', source: 'patrol-transitions', paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [3, 3] } })
      for (const layer of ['patrol-area-fill', 'patrol-route-line']) map.on('click', layer, event => {
        const detail = document.createElement('div'); detail.textContent = event.features[0].properties.title
        new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(detail).addTo(map)
      })
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 55, maxZoom: 16, duration: 0 })
    return () => markers.forEach(marker => marker.remove())
  }, [blocks, type, mode, start, loaded, selectedIndex, context])
  useEffect(() => {
    if (loaded && focus) mapRef.current?.flyTo({ center: [focus.longitude, focus.latitude], zoom: 16 })
  }, [loaded, focus])
  return <div className="patrol-map" aria-label={onPoint ? 'Patrol configuration map' : 'Read-only patrol schedule map'}>
    {hasMapTilerWebApiKey ? <><div className="patrol-map__canvas" ref={container} />{!loaded && !mapError && <div className="patrol-map__empty" role="status">Loading patrol map…</div>}{mapError && <p className="patrol-map__error patrol-notice is-warning" role="status">{mapError}</p>}</> : <div className="patrol-map__empty" role="status">Map configuration is unavailable. Add the MapTiler web key to display the map.</div>}
    <div className="patrol-map__legend"><span>● Coverage / saved path</span><span>┄ Assignment sequence</span></div>
  </div>
}
