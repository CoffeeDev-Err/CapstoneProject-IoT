import { getMapPerformanceOptions } from '../utils/mapPerformance'
import { buildReportRouteTrace } from '../utils/reportRouteTrace'
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

function ReportLocationMap({ incident, markerLabel = 'Reported location', routePoints = [], roadMatching }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [initialIsDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const routeDataRef = useRef(featureCollection())
  const positionsRef = useRef([])
  const pointMarkersRef = useRef([])
  const popupRef = useRef(null)
  const [visibleLayers, setVisibleLayers] = useState({ recorded: true, trace: true, turns: true, matched: true })
  const threeDRef = useRef(false)
  const mapModeRef = useRef('street')
  const isDarkRef = useRef(initialIsDark)
  const styleSignatureRef = useRef(`street:${initialIsDark ? 'dark' : 'light'}`)
  const [mapMode, setMapMode] = useState('street')
  const [threeDEnabled, setThreeDEnabled] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const isDark = useDocumentTheme()

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
    [...routeTrace.segments.flat(), ...(routePositions.length ? [routePositions[0]] : []), ...(incidentPosition ? [incidentPosition] : []),
      ...(visibleLayers.matched ? (roadMatching?.segments || []).flatMap(segment => segment.coordinates.map(([longitude, latitude]) => [latitude, longitude])) : [])]
  ), [incidentPosition, roadMatching, routePositions, routeTrace, visibleLayers.matched])
  const mapCenter = incidentPosition || routePositions[routePositions.length - 1] || null
  const mapCenterLatitude = mapCenter?.[0] ?? null
  const mapCenterLongitude = mapCenter?.[1] ?? null

  const routeData = useMemo(() => featureCollection(
    [
      ...(visibleLayers.trace ? routeTrace.segments.map((positions) => ({
        type: 'Feature',
        properties: { kind: 'trace' },
        geometry: {
          type: 'LineString',
          coordinates: positions.map(([latitude, longitude]) => [longitude, latitude]),
        },
      })) : []),
      ...(visibleLayers.recorded ? routePoints.filter(point => isValidCoordinate(point.latitude, point.longitude)).map(point => ({
        type: 'Feature', properties: { kind: 'recorded', recorded_at: point.recorded_at, accuracy: point.accuracy ?? 'unknown' },
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
  ), [roadMatching, routePoints, routeTrace, visibleLayers])

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

  const renderPointMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    pointMarkersRef.current.forEach((marker) => marker.remove())
    pointMarkersRef.current = []

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
  }, [incidentPosition, markerLabel, routePositions, routeTrace])

  useEffect(() => {
    if (
      !hasMapTilerWebApiKey
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
      zoom: 17,
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

    const handleStyleLoad = () => {
      addReportRouteLayer(map, routeDataRef.current)
      applyThreeDimensionalTerrain(map, threeDRef.current)
      setMapReady(true)
      window.setTimeout(() => {
        map.resize()
        fitReportMap(false)
      }, 120)
    }
    map.on('style.load', handleStyleLoad)
    const showSample = event => {
      const feature = event.features?.[0]
      if (!feature) return
      // A turn can coincide with its raw sample; keep the more specific tooltip.
      if (feature.properties.kind === 'recorded' && map.getLayer('geosentri-report-turns')
        && map.queryRenderedFeatures(event.point, { layers: ['geosentri-report-turns'] }).length) return
      popupRef.current?.remove()
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

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      removeNavigationListeners()
      resizeObserver.disconnect()
      pointMarkersRef.current.forEach((marker) => marker.remove())
      pointMarkersRef.current = []
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [fitReportMap, initialIsDark, mapCenterLatitude, mapCenterLongitude])

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
  }, [fitReportMap, mapPositions, renderPointMarkers, routeData])

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
        No valid GPS coordinates were saved for this report.
      </div>
    )
  }

  if (!hasMapTilerWebApiKey) {
    return (
      <div className="report-location-map__empty">
        Add VITE_MAPTILER_API_KEY to display the report location and route.
      </div>
    )
  }

  return (
    <div className="report-location-map">
      <div className="report-location-map__stage">
        <div ref={containerRef} className="report-location-map__canvas" aria-label="Reported location and officer route map" />
        <MapStyleControls
          compact
          mapMode={mapMode}
          threeDEnabled={threeDEnabled}
          onMapModeChange={setMapMode}
          onThreeDChange={setThreeDEnabled}
        />
        <MapAttribution />
        {!mapReady && (
          <div className="map-style-loading map-style-loading--compact" role="status" aria-label="Loading report map">
            <SkeletonBlock width="4.5rem" height="0.6rem" />
          </div>
        )}
      </div>

      <div className="report-location-map__legend" aria-label="Map legend">
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
    </div>
  )
}

export default ReportLocationMap
