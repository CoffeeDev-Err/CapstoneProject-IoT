import { getMapPerformanceOptions } from '../utils/mapPerformance'
import { buildReportRouteTrace } from '../utils/reportRouteTrace'
import { checkpointDetails, groupCheckpoints, hourlySequenceFeatures } from '../utils/dutyGpsHistory'
import { createHistoryPopupContent } from '../utils/historyMapPopup'
import { CABAGAN_CENTER } from '../utils/cabaganGeofence'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../services/configureMapLibre'
import MapAttribution from './MapAttribution'
import { SkeletonBlock } from './LoadingSkeleton'
import MapStyleControls from './MapStyleControls'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import {
  getMapTilerWebStyleUrl,
  hasMapTilerWebApiKey,
} from '../services/mapTilerWeb'
import {
  applyThreeDimensionalTerrain,
  featureCollection,
  setGeoJsonSourceData,
} from '../utils/mapLibreLayers'
import { addMobileLikeNavigationControls } from '../utils/mapNavigation'

const isValidCoordinate = (latitude, longitude) => (
  latitude !== null
  && latitude !== undefined
  && latitude !== ''
  && longitude !== null
  && longitude !== undefined
  && longitude !== ''
  && Number.isFinite(Number(latitude))
  && Number.isFinite(Number(longitude))
  && Number(latitude) >= -90
  && Number(latitude) <= 90
  && Number(longitude) >= -180
  && Number(longitude) <= 180
)

const addReportRouteLayer = (map, data) => {
  if (!map.getSource('geosentri-report-route')) {
    map.addSource('geosentri-report-route', { type: 'geojson', data })
  } else {
    setGeoJsonSourceData(map, 'geosentri-report-route', data)
  }
  if (!map.getLayer('geosentri-report-route-line')) {
    map.addLayer({
      id: 'geosentri-report-route-line',
      type: 'line',
      source: 'geosentri-report-route',
      filter: ['==', ['get', 'kind'], 'trace'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2563eb',
        'line-width': 4,
        'line-opacity': 0.88,
        'line-dasharray': [2, 1],
      },
    })
  }
  const layers = [
    { id: 'geosentri-hourly-sequence', type: 'line', filter: ['==', ['get', 'kind'], 'hourly_sequence'],
      paint: { 'line-color': '#2563eb', 'line-width': 3, 'line-dasharray': [2, 2] } },
    { id: 'geosentri-hourly-arrows', type: 'symbol', filter: ['==', ['get', 'kind'], 'hourly_arrow'],
      layout: { 'text-field': '→', 'text-size': 24, 'text-rotate': ['get', 'bearing'], 'text-rotation-alignment': 'map', 'text-allow-overlap': true },
      paint: { 'text-color': '#2563eb', 'text-halo-color': '#ffffff', 'text-halo-width': 1 } },
    { id: 'geosentri-report-recorded', type: 'circle', filter: ['==', ['get', 'kind'], 'recorded'],
      paint: { 'circle-radius': 3, 'circle-color': '#3b82f6', 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.7 } },
    { id: 'geosentri-report-matched', type: 'line', filter: ['==', ['get', 'kind'], 'matched'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#a855f7', 'line-width': 5, 'line-opacity': 0.8 } },
    { id: 'geosentri-report-turns', type: 'circle', filter: ['==', ['get', 'kind'], 'turn'],
      paint: { 'circle-radius': 7, 'circle-color': '#f59e0b', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } },
  ]
  layers.forEach(layer => {
    if (!map.getLayer(layer.id)) map.addLayer({ ...layer, source: 'geosentri-report-route' },
      layer.type === 'line' ? 'geosentri-report-route-line' : undefined)
  })
}

const createPointMarker = ({ className, label, title }) => {
  const element = document.createElement('div')
  element.className = `report-map-marker ${className}`
  element.title = title
  element.setAttribute('aria-label', title)
  if (label) {
    const caption = document.createElement('span')
    caption.className = 'report-map-marker__label'
    caption.textContent = label
    element.append(caption)
  }
  return element
}

const EMPTY_ROUTE_POINTS = []

function ReportLocationMap({ active = true, incident, markerLabel = 'Reported location', routePoints = EMPTY_ROUTE_POINTS, roadMatching,
  hourlyCheckpoints, onSelectHour, historyContext, mapLabel = 'Reported location and officer route map', emptyMessage = 'No valid GPS coordinates were saved for this report.' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [initialIsDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const routeDataRef = useRef(featureCollection())
  const positionsRef = useRef([])
  const pointMarkersRef = useRef([])
  const popupRef = useRef(null)
  const popupTriggerRef = useRef(null)
  const suppressFocusPopupRef = useRef(false)
  const historyContextRef = useRef(historyContext)
  const [visibleLayers, setVisibleLayers] = useState({ recorded: true, trace: true, turns: true, matched: true })
  const threeDRef = useRef(false)
  const mapModeRef = useRef('street')
  const isDarkRef = useRef(initialIsDark)
  const styleSignatureRef = useRef(`street:${initialIsDark ? 'dark' : 'light'}`)
  const [mapMode, setMapMode] = useState('street')
  const [threeDEnabled, setThreeDEnabled] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const isDark = useDocumentTheme()

  useEffect(() => { historyContextRef.current = historyContext }, [historyContext])

  useEffect(() => {
    mapModeRef.current = mapMode
  }, [mapMode])

  useEffect(() => {
    isDarkRef.current = isDark
  }, [isDark])

  const incidentPosition = useMemo(() => (
    isValidCoordinate(incident?.latitude, incident?.longitude)
      ? [Number(incident.latitude), Number(incident.longitude)]
      : null
  ), [incident])

  const routePositions = useMemo(() => routePoints
    .filter((point) => isValidCoordinate(point.latitude, point.longitude))
    .map((point) => [Number(point.latitude), Number(point.longitude)]), [routePoints])
  const routeTrace = useMemo(() => buildReportRouteTrace(routePoints), [routePoints])

  const mapPositions = useMemo(() => (
    [...routePositions, ...(hourlyCheckpoints || []).filter(hour => hour.checkpoint).map(hour => [Number(hour.checkpoint.latitude), Number(hour.checkpoint.longitude)]), ...(incidentPosition ? [incidentPosition] : []),
      ...(visibleLayers.matched ? (roadMatching?.segments || []).flatMap(segment => segment.coordinates.map(([longitude, latitude]) => [latitude, longitude])) : [])]
  ), [hourlyCheckpoints, incidentPosition, roadMatching, routePositions, visibleLayers.matched])
  // History stays a map even with no records. This is a neutral area center,
  // never a fabricated officer position or fallback live location.
  const mapCenter = incidentPosition || mapPositions.at(-1) || (historyContext ? CABAGAN_CENTER : null)
  const mapCenterLatitude = mapCenter?.[0] ?? null
  const mapCenterLongitude = mapCenter?.[1] ?? null

  const routeData = useMemo(() => featureCollection(
    [
      ...hourlySequenceFeatures(hourlyCheckpoints || []),
      ...(visibleLayers.trace ? routeTrace.segments.map((positions) => ({
        type: 'Feature',
        properties: { kind: 'trace' },
        geometry: {
          type: 'LineString',
          coordinates: positions.map(([latitude, longitude]) => [longitude, latitude]),
        },
      })) : []),
      ...(visibleLayers.recorded ? routePoints.filter(point => isValidCoordinate(point.latitude, point.longitude)).map(point => ({
        type: 'Feature', properties: { kind: 'recorded', recorded_at: point.recorded_at, accuracy: point.accuracy ?? 'unknown',
          ...(historyContext && { location_name: point.location_name || '', speed: point.speed, battery_level: point.battery_level,
            satellites: point.satellites, device_assignment_id: point.device_assignment_id }) },
        geometry: { type: 'Point', coordinates: [Number(point.longitude), Number(point.latitude)] },
      })) : []),
      ...(visibleLayers.turns ? routeTrace.turns.map(turn => ({
        type: 'Feature', properties: { ...turn, kind: 'turn' },
        geometry: { type: 'Point', coordinates: [turn.longitude, turn.latitude] },
      })) : []),
      ...(visibleLayers.matched ? (roadMatching?.segments || []).map(segment => ({
        type: 'Feature', properties: { kind: 'matched' }, geometry: { type: 'LineString', coordinates: segment.coordinates },
      })) : []),
    ],
  ), [historyContext, hourlyCheckpoints, roadMatching, routePoints, routeTrace, visibleLayers])

  const fitReportMap = useCallback((animate = true) => {
    const map = mapRef.current
    const positions = positionsRef.current
    if (!map || positions.length === 0) return
    const lngLatPositions = positions.map(([latitude, longitude]) => [longitude, latitude])

    if (lngLatPositions.length === 1) {
      map.easeTo({ center: lngLatPositions[0], zoom: 17, duration: animate ? 650 : 0 })
      return
    }

    const bounds = lngLatPositions.reduce(
      (currentBounds, position) => currentBounds.extend(position),
      new maplibregl.LngLatBounds(lngLatPositions[0], lngLatPositions[0]),
    )
    map.fitBounds(bounds, { padding: 28, maxZoom: 17, duration: animate ? 650 : 0 })
  }, [])

  const restorePopupFocus = useCallback(() => {
    const trigger = popupTriggerRef.current
    if (!trigger?.isConnected) return
    suppressFocusPopupRef.current = true
    trigger.focus({ preventScroll: true })
    suppressFocusPopupRef.current = false
  }, [])

  const renderPointMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    pointMarkersRef.current.forEach((marker) => marker.remove())
    pointMarkersRef.current = []

    groupCheckpoints(hourlyCheckpoints || []).forEach(group => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'duty-gps-marker'
      element.textContent = historyContext ? String(group[0].hour + 1) : group.map(hour => hour.hour + 1).join(', ')
      if (historyContext && group.length > 1) {
        const count = document.createElement('span')
        count.className = 'duty-gps-marker__count'
        count.textContent = `+${group.length - 1}`
        element.append(count)
      }
      element.setAttribute('aria-label', group.map(checkpointDetails).join('\n'))
      if (historyContext) element.setAttribute('aria-expanded', 'false')
      const showDetails = () => {
        popupRef.current?.remove()
        const content = historyContext
          ? createHistoryPopupContent({ hours: group, context: historyContext })
          : document.createElement('div')
        if (!historyContext) group.forEach(hour => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'duty-gps-popup-hour'
          button.textContent = checkpointDetails(hour)
          button.addEventListener('click', () => onSelectHour?.(String(hour.hour)))
          content.append(button)
        })
        popupRef.current = new maplibregl.Popup({ maxWidth: '340px', focusAfterOpen: false,
          ...(historyContext && { className: 'history-location-popup', closeOnClick: false }) })
          .setLngLat([group[0].checkpoint.longitude, group[0].checkpoint.latitude]).setDOMContent(content).addTo(map)
        if (historyContext) {
          popupTriggerRef.current = element
          element.classList.add('is-selected')
          element.setAttribute('aria-expanded', 'true')
          popupRef.current.on?.('close', () => { element.classList.remove('is-selected'); element.setAttribute('aria-expanded', 'false') })
          popupRef.current.getElement?.()?.querySelector('.maplibregl-popup-close-button')?.addEventListener('click', restorePopupFocus)
        }
      }
      element.addEventListener('mouseenter', showDetails)
      element.addEventListener('focus', () => { if (!suppressFocusPopupRef.current) showDetails() })
      element.addEventListener('click', event => {
        event.stopPropagation()
        onSelectHour?.(String(group[0].hour)); showDetails()
        if (event.detail === 0) popupRef.current?.getElement?.()?.querySelector('button, select')?.focus()
      })
      pointMarkersRef.current.push(new maplibregl.Marker({ element }).setLngLat([group[0].checkpoint.longitude, group[0].checkpoint.latitude]).addTo(map))
    })

    if (routePositions.length > 0) {
      pointMarkersRef.current.push(new maplibregl.Marker({
        element: createPointMarker({
          className: 'report-map-marker--start',
          title: 'Route start',
        }),
      }).setLngLat([routePositions[0][1], routePositions[0][0]]).addTo(map))
    }

    if (routeTrace.segments.length) {
      const lastPosition = routeTrace.segments.at(-1).at(-1)
      pointMarkersRef.current.push(new maplibregl.Marker({
        element: createPointMarker({
          className: 'report-map-marker--end',
          title: 'Route end',
        }),
      }).setLngLat([lastPosition[1], lastPosition[0]]).addTo(map))
    }

    if (incidentPosition) {
      pointMarkersRef.current.push(new maplibregl.Marker({
        element: createPointMarker({
          className: 'report-map-marker--incident',
          label: markerLabel,
          title: markerLabel,
        }),
        anchor: 'center',
      }).setLngLat([incidentPosition[1], incidentPosition[0]]).addTo(map))
    }
  }, [historyContext, hourlyCheckpoints, incidentPosition, markerLabel, onSelectHour, restorePopupFocus, routePositions, routeTrace])

  useEffect(() => {
    if (
      !active
      || !hasMapTilerWebApiKey
      || !containerRef.current
      || mapCenterLatitude === null
      || mapCenterLongitude === null
    ) return undefined

    const currentMapMode = mapModeRef.current
    const currentIsDark = isDarkRef.current
    styleSignatureRef.current = `${currentMapMode}:${currentIsDark ? 'dark' : 'light'}`

    const map = new maplibregl.Map({
      ...getMapPerformanceOptions(),
      container: containerRef.current,
      style: getMapTilerWebStyleUrl(currentMapMode, currentIsDark),
      center: [mapCenterLongitude, mapCenterLatitude],
      zoom: historyContextRef.current ? 13 : 17,
      maxZoom: 20,
      maxPitch: 65,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      antialias: false,
      attributionControl: false,
      fadeDuration: 180,
    })
    mapRef.current = map
    const removeNavigationListeners = addMobileLikeNavigationControls(map)

    let resizeTimer
    const handleStyleLoad = () => {
      addReportRouteLayer(map, routeDataRef.current)
      applyThreeDimensionalTerrain(map, threeDRef.current)
      setMapReady(true)
      setMapError('')
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        map.resize()
        fitReportMap(false)
      }, 120)
    }
    map.on('style.load', handleStyleLoad)
    const handleMapError = () => {
      if (historyContextRef.current && !map.isStyleLoaded()) setMapError('The map could not be loaded. Check your connection and try again.')
    }
    map.on('error', handleMapError)
    const showSample = event => {
      const feature = event.features?.[0]
      if (!feature) return
      // A turn can coincide with its raw sample; keep the more specific tooltip.
      if (feature.properties.kind === 'recorded' && map.getLayer('geosentri-report-turns')
        && map.queryRenderedFeatures(event.point, { layers: ['geosentri-report-turns'] }).length) return
      popupRef.current?.remove()
      if (historyContextRef.current && feature.properties.kind === 'recorded') {
        popupTriggerRef.current = null
        const content = createHistoryPopupContent({ point: { ...feature.properties,
          longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1] }, context: historyContextRef.current })
        popupRef.current = new maplibregl.Popup({ maxWidth: '340px', className: 'history-location-popup', focusAfterOpen: false })
          .setLngLat(feature.geometry.coordinates).setDOMContent(content).addTo(map)
        return
      }
      const details = document.createElement('div')
      details.className = 'report-map-sample-details'
      const properties = feature.properties
      const time = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
      details.textContent = properties.kind === 'turn'
        ? `Probable ${properties.direction === 'reversal' ? 'direction reversal' : `${properties.direction} turn`} (${properties.angle}°). Sample: ${time(properties.recorded_at)}. Direction change inferred between ${time(properties.from)} and ${time(properties.to)}; the exact corner is unknown.${properties.accuracy_unknown ? ' GPS accuracy was not recorded.' : ''}`
        : `Recorded GPS sample: ${time(properties.recorded_at)}. Accuracy: ${properties.accuracy === 'unknown' ? 'not recorded' : `${properties.accuracy} m`}. These are received coordinates, not a verified road position.`
      popupRef.current = new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(feature.geometry.coordinates).setDOMContent(details).addTo(map)
    }
    map.on('click', 'geosentri-report-turns', showSample)
    map.on('click', 'geosentri-report-recorded', showSample)
    const showHistorySample = event => { if (historyContextRef.current) showSample(event) }
    map.on('mouseenter', 'geosentri-report-recorded', showHistorySample)
    const closeOnEscape = event => {
      if (event.key === 'Escape') { popupRef.current?.remove(); restorePopupFocus() }
    }
    containerRef.current.addEventListener('keydown', closeOnEscape)
    const mapContainer = containerRef.current

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      window.clearTimeout(resizeTimer)
      map.off('style.load', handleStyleLoad)
      map.off('error', handleMapError)
      map.off('click', 'geosentri-report-turns', showSample)
      map.off('click', 'geosentri-report-recorded', showSample)
      map.off('mouseenter', 'geosentri-report-recorded', showHistorySample)
      mapContainer.removeEventListener('keydown', closeOnEscape)
      map.stop()
      removeNavigationListeners()
      resizeObserver.disconnect()
      pointMarkersRef.current.forEach((marker) => marker.remove())
      pointMarkersRef.current = []
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [active, fitReportMap, initialIsDark, mapCenterLatitude, mapCenterLongitude, restorePopupFocus])

  useEffect(() => {
    routeDataRef.current = routeData
    popupRef.current?.remove()
    positionsRef.current = mapPositions
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) setGeoJsonSourceData(map, 'geosentri-report-route', routeData)
    renderPointMarkers()
    const timer = window.setTimeout(() => fitReportMap(true), 120)
    return () => window.clearTimeout(timer)
  }, [active, fitReportMap, mapPositions, renderPointMarkers, routeData])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const signature = `${mapMode}:${isDark ? 'dark' : 'light'}`
    if (styleSignatureRef.current === signature) return
    styleSignatureRef.current = signature
    setMapReady(false)
    map.setStyle(getMapTilerWebStyleUrl(mapMode, isDark), { diff: false })
  }, [isDark, mapMode])

  useEffect(() => {
    threeDRef.current = threeDEnabled
    const map = mapRef.current
    if (map?.isStyleLoaded()) applyThreeDimensionalTerrain(map, threeDEnabled)
  }, [threeDEnabled])

  if (!mapCenter) {
    return (
      <div className="report-location-map__empty">
        {emptyMessage}
      </div>
    )
  }

  if (!hasMapTilerWebApiKey) {
    return (
      <div className="report-location-map__empty">
        {historyContext ? 'The history map is unavailable. Please check the map service and try again.' : 'Map is unavailable. Saved GPS details remain available below.'}
      </div>
    )
  }

  const MapDetails = historyContext ? 'details' : 'div'
  return (
    <div className="report-location-map">
      <div className="report-location-map__stage">
        <div ref={containerRef} className="report-location-map__canvas" aria-label={mapLabel} />
        <MapStyleControls
          compact
          mapMode={mapMode}
          threeDEnabled={threeDEnabled}
          onMapModeChange={setMapMode}
          onThreeDChange={setThreeDEnabled}
        />
        <MapAttribution />
        {historyContext && mapError && <div className="history-map-service-error" role="status"><span>{mapError}</span>
          <button type="button" onClick={() => {
            setMapError('')
            mapRef.current?.setStyle(getMapTilerWebStyleUrl(mapModeRef.current, isDarkRef.current), { diff: false })
          }}>Retry map</button>
        </div>}
        {!mapReady && !mapError && (
          <div className="map-style-loading map-style-loading--compact" role="status" aria-label={historyContext ? 'Loading history map' : 'Loading report map'}>
            <SkeletonBlock width="4.5rem" height="0.6rem" />
          </div>
        )}
      </div>

      <MapDetails className={historyContext ? 'history-map-options' : undefined}>
      {historyContext && <summary>Map layers &amp; legend</summary>}
      <div className="report-location-map__legend" aria-label="Map legend">
        {hourlyCheckpoints && <span><i className="report-map-line" />Hourly sequence → (approximate connections)</span>}
        {incidentPosition && (
          <span><i className="report-map-dot report-map-dot--incident" />{markerLabel}</span>
        )}
        {routePositions.length > 0 && (
          <>
            <span><i className="report-map-dot report-map-dot--start" />Route start</span>
            {routeTrace.segments.length > 0 && <span><i className="report-map-line" />Filtered GPS trace</span>}
            {routeTrace.turns.length > 0 && <span><i className="report-map-dot report-map-dot--turn" />Probable turn</span>}
            {roadMatching?.segments?.length > 0 && <span><i className="report-map-line report-map-line--matched" />Estimated road route</span>}
          </>
        )}
      </div>
      {routePoints.length > 0 && <fieldset className="report-route-layers">
        <legend>GPS display layers</legend>
        {[['recorded', 'Recorded GPS points'], ['trace', 'Filtered GPS trace'], ['turns', 'Probable turns'],
          ...(roadMatching?.segments?.length ? [['matched', 'Estimated road route']] : [])].map(([key, label]) => (
          <label key={key}><input type="checkbox" checked={visibleLayers[key]}
            onChange={event => setVisibleLayers(previous => ({ ...previous, [key]: event.target.checked }))} />{label}</label>
        ))}
      </fieldset>}
      {routePoints.length > 0 && <p className="report-route-history__status">
        GPS samples indicate approximate positions, not a verified path along roads.
        {' '}{routeTrace.simplified} small position variations suppressed; {routeTrace.omitted} invalid or low-accuracy samples omitted from the trace.
        {routeTrace.unknownAccuracy > 0 && ` Accuracy was not recorded for ${routeTrace.unknownAccuracy} samples.`}
        {!routeTrace.segments.length && ' Insufficient reliable movement to draw a trace.'}
        {routeTrace.turns.length > 0 && ` ${routeTrace.turns.length} probable direction changes; select an amber marker for details. Exact turn locations cannot be confirmed between samples.`}
        {roadMatching?.segments?.length > 0 && ' The purple road route is an estimate for vehicle travel, not the recorded GPS path.'}
      </p>}
      </MapDetails>
    </div>
  )
}

export default ReportLocationMap
