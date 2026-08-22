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
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2563eb',
        'line-width': 4,
        'line-opacity': 0.88,
      },
    })
  }
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

function ReportLocationMap({ incident, markerLabel = 'Reported location', routePoints = [] }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [initialIsDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const routeDataRef = useRef(featureCollection())
  const positionsRef = useRef([])
  const pointMarkersRef = useRef([])
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

  const mapPositions = useMemo(() => (
    incidentPosition ? [...routePositions, incidentPosition] : routePositions
  ), [incidentPosition, routePositions])
  const mapCenter = incidentPosition || routePositions[routePositions.length - 1] || null
  const mapCenterLatitude = mapCenter?.[0] ?? null
  const mapCenterLongitude = mapCenter?.[1] ?? null

  const routeData = useMemo(() => featureCollection(
    routePositions.length > 1
      ? [{
        type: 'Feature',
        properties: { kind: 'route' },
        geometry: {
          type: 'LineString',
          coordinates: routePositions.map(([latitude, longitude]) => [longitude, latitude]),
        },
      }]
      : [],
  ), [routePositions])

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

    if (routePositions.length > 1) {
      const lastPosition = routePositions[routePositions.length - 1]
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
  }, [incidentPosition, markerLabel, routePositions])

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
      container: containerRef.current,
      style: getMapTilerWebStyleUrl(currentMapMode, currentIsDark),
      center: [mapCenterLongitude, mapCenterLatitude],
      zoom: 17,
      maxZoom: 20,
      maxPitch: 65,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      antialias: true,
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

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      removeNavigationListeners()
      resizeObserver.disconnect()
      pointMarkersRef.current.forEach((marker) => marker.remove())
      pointMarkersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [fitReportMap, initialIsDark, mapCenterLatitude, mapCenterLongitude])

  useEffect(() => {
    routeDataRef.current = routeData
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
            <span><i className="report-map-line" />Officer route</span>
          </>
        )}
      </div>
    </div>
  )
}

export default ReportLocationMap
