/**
 * Native WebGL live map for supervisor monitoring.
 * MapLibre owns the long-lived map instance while React updates its data,
 * controls, and accessible DOM markers without remounting the screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import Supercluster from 'supercluster'
import '../services/configureMapLibre'
import MapAttribution from './MapAttribution'
import MapStyleControls from './MapStyleControls'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import {
  getMapTilerWebStyleUrl,
  hasMapTilerWebApiKey,
} from '../services/mapTilerWeb'
import { CABAGAN_CENTER } from '../utils/cabaganGeofence'
import {
  applyThreeDimensionalTerrain,
  cabaganBoundaryFeature,
  cabaganBoundaryLngLat,
  createCircleFeature,
  featureCollection,
  setGeoJsonSourceData,
} from '../utils/mapLibreLayers'
import { addMobileLikeNavigationControls } from '../utils/mapNavigation'
import {
  MARKER_ANIMATION_DURATION_MS,
  interpolateLatLng,
} from '../utils/mapMotion'

const LIVE_MAP_DEFAULT_CENTER = [CABAGAN_CENTER[1], CABAGAN_CENTER[0]]
const LIVE_MAP_DEFAULT_ZOOM = 11.8
const STREET_FOCUS_ZOOM = 16
const SATELLITE_FOCUS_ZOOM = 15
const PERSONNEL_CLUSTER_MAX_ZOOM = 17
const PERSONNEL_CLUSTER_RADIUS = 56

const OUTER_MASK_RING = [
  [120.8, 18.2],
  [122.8, 18.2],
  [122.8, 16.2],
  [120.8, 16.2],
  [120.8, 18.2],
]

const OUTSIDE_MASK_FEATURE = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [OUTER_MASK_RING, [...cabaganBoundaryLngLat].reverse()],
  },
}

const isValidPosition = (member) => (
  Number.isFinite(Number(member?.latitude))
  && Number.isFinite(Number(member?.longitude))
)

const getMarkerStatusClass = (status = '') => {
  const normalized = status.toLowerCase()

  if (normalized.includes('emergency') || normalized.includes('backup') || normalized.includes('alert')) {
    return 'police-marker--critical'
  }
  if (normalized.includes('ongoing case') || normalized.includes('responding') || normalized.includes('operation') || normalized.includes('dispatch')) {
    return 'police-marker--operation'
  }
  if (normalized.includes('on duty') || normalized.includes('on patrol') || normalized.includes('monitor')) {
    return 'police-marker--on-duty'
  }
  return 'police-marker--default'
}

const getMarkerClass = (member) => {
  if (member.isInsideCabagan === false || member.emergencyActive) return 'police-marker--out-of-boundary'
  if (member.operationActive) return 'police-marker--operation'
  return getMarkerStatusClass(member.status)
}

const getFallbackPhoto = (member) => (
  `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=1d4ed8&color=fff&size=96`
)

const createPersonnelMarkerElement = (member, onSelect) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'police-marker-shell maplibre-personnel-marker'
  button.setAttribute('aria-label', `View ${member.name} on live map`)

  const pin = document.createElement('span')
  pin.className = `police-marker ${getMarkerClass(member)}`
  const photoFrame = document.createElement('span')
  photoFrame.className = 'police-marker__photo-frame'
  const photo = document.createElement('img')
  photo.className = 'police-marker__photo'
  photo.alt = member.name
  photo.dataset.intendedSource = member.photoUrl || ''
  photo.dataset.fallbackSource = getFallbackPhoto(member)
  photo.src = photo.dataset.intendedSource || photo.dataset.fallbackSource
  photo.addEventListener('error', () => {
    if (photo.src !== photo.dataset.fallbackSource) photo.src = photo.dataset.fallbackSource
  })

  photoFrame.append(photo)
  pin.append(photoFrame)
  button.append(pin)
  button.addEventListener('click', () => onSelect())
  return { button, photo, pin }
}

const addOperationalLayers = (map, deploymentData) => {
  const firstSymbolLayerId = map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id

  if (!map.getSource('geosentri-outside-mask')) {
    map.addSource('geosentri-outside-mask', { type: 'geojson', data: OUTSIDE_MASK_FEATURE })
  }
  if (!map.getLayer('geosentri-outside-mask-fill')) {
    map.addLayer({
      id: 'geosentri-outside-mask-fill',
      type: 'fill',
      source: 'geosentri-outside-mask',
      paint: { 'fill-color': '#dc2626', 'fill-opacity': 0.12 },
    }, firstSymbolLayerId)
  }

  if (!map.getSource('geosentri-cabagan-boundary')) {
    map.addSource('geosentri-cabagan-boundary', { type: 'geojson', data: cabaganBoundaryFeature })
  }
  if (!map.getLayer('geosentri-cabagan-boundary-line')) {
    map.addLayer({
      id: 'geosentri-cabagan-boundary-line',
      type: 'line',
      source: 'geosentri-cabagan-boundary',
      paint: {
        'line-color': '#dc2626',
        'line-width': 2,
        'line-dasharray': [4, 3.5],
      },
    }, firstSymbolLayerId)
  }

  if (!map.getSource('geosentri-deployments')) {
    map.addSource('geosentri-deployments', { type: 'geojson', data: deploymentData })
  } else {
    setGeoJsonSourceData(map, 'geosentri-deployments', deploymentData)
  }
  if (!map.getLayer('geosentri-deployments-fill')) {
    map.addLayer({
      id: 'geosentri-deployments-fill',
      type: 'fill',
      source: 'geosentri-deployments',
      paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.1 },
    }, firstSymbolLayerId)
  }
  if (!map.getLayer('geosentri-deployments-line')) {
    map.addLayer({
      id: 'geosentri-deployments-line',
      type: 'line',
      source: 'geosentri-deployments',
      paint: {
        'line-color': '#2563eb',
        'line-width': 2,
        'line-dasharray': [3.5, 3],
      },
    }, firstSymbolLayerId)
  }
}

function PersonnelMap({
  personnel,
  deployments = [],
  onSelectPersonnel,
  followedPersonnelId,
  onStopFollowing,
  layoutVersion = 0,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [initialIsDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const markerStatesRef = useRef(new Map())
  const clusterMarkersRef = useRef([])
  const clusterIndexRef = useRef(null)
  const personnelRef = useRef(personnel)
  const followedPersonnelIdRef = useRef(followedPersonnelId)
  const deploymentDataRef = useRef(featureCollection())
  const threeDRef = useRef(false)
  const styleSignatureRef = useRef(`street:${initialIsDark ? 'dark' : 'light'}`)
  const [mapMode, setMapMode] = useState('street')
  const [threeDEnabled, setThreeDEnabled] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const isDark = useDocumentTheme()
  const followedPersonnel = personnel.find((member) => member.id === followedPersonnelId) || null

  useEffect(() => {
    followedPersonnelIdRef.current = followedPersonnelId
  }, [followedPersonnelId])

  const deploymentData = useMemo(() => {
    const groups = new Map()
    deployments
      .filter((assignment) => assignment.isCurrentShift !== false)
      .forEach((assignment) => {
        const latitude = Number(assignment.latitude)
        const longitude = Number(assignment.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
        const key = assignment.groupId || assignment.patrolArea
        if (!groups.has(key)) {
          groups.set(key, createCircleFeature(longitude, latitude, 320, {
            id: key,
            patrolArea: assignment.patrolArea,
          }))
        }
      })
    return featureCollection([...groups.values()])
  }, [deployments])

  const clearClusterMarkers = useCallback(() => {
    clusterMarkersRef.current.forEach((marker) => marker.remove())
    clusterMarkersRef.current = []
  }, [])

  const renderClusters = useCallback(() => {
    const map = mapRef.current
    const index = clusterIndexRef.current
    if (!map || !index || !map.loaded()) return

    clearClusterMarkers()
    markerStatesRef.current.forEach((state) => {
      state.element.style.display = 'none'
    })

    const bounds = map.getBounds()
    const clusters = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      Math.max(0, Math.min(20, Math.floor(map.getZoom()))),
    )

    clusters.forEach((feature) => {
      if (!feature.properties.cluster) {
        const markerState = markerStatesRef.current.get(feature.properties.memberId)
        if (markerState) markerState.element.style.display = ''
        return
      }

      const element = document.createElement('button')
      element.type = 'button'
      const tone = feature.properties.critical > 0
        ? 'personnel-cluster--critical'
        : (feature.properties.operation > 0 ? 'personnel-cluster--operation' : 'personnel-cluster--duty')
      element.className = 'personnel-cluster-shell maplibre-personnel-cluster'
      const badge = document.createElement('span')
      badge.className = `personnel-cluster ${tone}`
      badge.textContent = String(feature.properties.point_count)
      element.append(badge)
      element.setAttribute('aria-label', `Zoom to ${feature.properties.point_count} grouped officers`)
      element.addEventListener('click', () => {
        const zoom = Math.min(index.getClusterExpansionZoom(feature.properties.cluster_id), 18)
        map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 650 })
      })
      const marker = new maplibregl.Marker({ element })
        .setLngLat(feature.geometry.coordinates)
        .addTo(map)
      clusterMarkersRef.current.push(marker)
    })

    markerStatesRef.current.forEach((state) => {
      if (state.element.classList.contains('is-followed')) state.element.style.display = ''
    })
  }, [clearClusterMarkers])

  const rebuildClusterIndex = useCallback(() => {
    const points = personnelRef.current
      .filter((member) => isValidPosition(member) && member.id !== followedPersonnelIdRef.current)
      .map((member) => ({
      type: 'Feature',
      properties: {
        memberId: member.id,
        critical: member.isInsideCabagan === false || member.emergencyActive ? 1 : 0,
        operation: member.operationActive ? 1 : 0,
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(member.longitude), Number(member.latitude)],
      },
      }))

    clusterIndexRef.current = new Supercluster({
      radius: PERSONNEL_CLUSTER_RADIUS,
      maxZoom: PERSONNEL_CLUSTER_MAX_ZOOM,
      map: (properties) => ({
        critical: properties.critical,
        operation: properties.operation,
      }),
      reduce: (accumulated, properties) => {
        accumulated.critical += properties.critical
        accumulated.operation += properties.operation
      },
    }).load(points)
    renderClusters()
  }, [renderClusters])

  useEffect(() => {
    if (!hasMapTilerWebApiKey || !containerRef.current) return undefined

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapTilerWebStyleUrl('street', initialIsDark),
      center: LIVE_MAP_DEFAULT_CENTER,
      zoom: LIVE_MAP_DEFAULT_ZOOM,
      maxZoom: 20,
      maxPitch: 65,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
      antialias: true,
      attributionControl: false,
      fadeDuration: 200,
    })
    mapRef.current = map
    const removeNavigationListeners = addMobileLikeNavigationControls(map)

    const handleStyleLoad = () => {
      addOperationalLayers(map, deploymentDataRef.current)
      applyThreeDimensionalTerrain(map, threeDRef.current)
      setMapReady(true)
      map.once('idle', rebuildClusterIndex)
    }
    const handleMoveEnd = () => renderClusters()
    const handleFocusLiveMap = () => {
      map.resize()
      map.easeTo({ center: LIVE_MAP_DEFAULT_CENTER, zoom: LIVE_MAP_DEFAULT_ZOOM, pitch: 0, duration: 700 })
    }

    map.on('style.load', handleStyleLoad)
    map.on('moveend', handleMoveEnd)
    window.addEventListener('focus-live-map', handleFocusLiveMap)

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)
    const markerStates = markerStatesRef.current

    return () => {
      removeNavigationListeners()
      resizeObserver.disconnect()
      window.removeEventListener('focus-live-map', handleFocusLiveMap)
      markerStates.forEach((state) => {
        if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
        state.marker.remove()
      })
      markerStates.clear()
      clearClusterMarkers()
      map.remove()
      mapRef.current = null
    }
  }, [clearClusterMarkers, initialIsDark, rebuildClusterIndex, renderClusters])

  useEffect(() => {
    personnelRef.current = personnel
    const map = mapRef.current
    if (!map) return undefined

    const validPersonnel = personnel.filter(isValidPosition)
    const validIds = new Set(validPersonnel.map((member) => member.id))
    markerStatesRef.current.forEach((state, id) => {
      if (validIds.has(id)) return
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      state.marker.remove()
      markerStatesRef.current.delete(id)
    })

    validPersonnel.forEach((member) => {
      let state = markerStatesRef.current.get(member.id)
      if (!state) {
        const markerElement = createPersonnelMarkerElement(member, () => {
          const latestState = markerStatesRef.current.get(member.id)
          if (latestState) onSelectPersonnel(latestState.member)
        })
        const marker = new maplibregl.Marker({ element: markerElement.button, anchor: 'bottom' })
          .setLngLat([Number(member.longitude), Number(member.latitude)])
          .addTo(map)
        state = {
          marker,
          element: markerElement.button,
          photo: markerElement.photo,
          pin: markerElement.pin,
          member,
          currentPosition: [Number(member.latitude), Number(member.longitude)],
          animationFrame: null,
        }
        markerStatesRef.current.set(member.id, state)
      }

      state.member = member
      state.element.classList.toggle('is-followed', member.id === followedPersonnelId)
      state.element.setAttribute('aria-label', `View ${member.name} on live map`)
      state.pin.className = `police-marker ${getMarkerClass(member)}`
      const nextPhoto = member.photoUrl || getFallbackPhoto(member)
      if (state.photo.dataset.intendedSource !== nextPhoto) {
        state.photo.dataset.intendedSource = nextPhoto
        state.photo.dataset.fallbackSource = getFallbackPhoto(member)
        state.photo.src = nextPhoto
      }

      const from = [...state.currentPosition]
      const target = [Number(member.latitude), Number(member.longitude)]
      if (from[0] === target[0] && from[1] === target[1]) return
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      if (member.id === followedPersonnelId) {
        map.easeTo({
          center: [target[1], target[0]],
          duration: MARKER_ANIMATION_DURATION_MS,
          essential: true,
        })
      }
      const startTime = performance.now()
      let lastRenderedAt = 0

      const tick = (now) => {
        const progress = Math.min((now - startTime) / MARKER_ANIMATION_DURATION_MS, 1)
        if (progress < 1 && now - lastRenderedAt < 1000 / 30) {
          state.animationFrame = requestAnimationFrame(tick)
          return
        }
        lastRenderedAt = now
        const nextPosition = interpolateLatLng(from, target, progress)
        state.currentPosition = nextPosition
        state.marker.setLngLat([nextPosition[1], nextPosition[0]])
        if (progress < 1) state.animationFrame = requestAnimationFrame(tick)
        else rebuildClusterIndex()
      }
      state.animationFrame = requestAnimationFrame(tick)
    })

    rebuildClusterIndex()
    return undefined
  }, [followedPersonnelId, onSelectPersonnel, personnel, rebuildClusterIndex])

  useEffect(() => {
    deploymentDataRef.current = deploymentData
    const map = mapRef.current
    if (map?.isStyleLoaded()) setGeoJsonSourceData(map, 'geosentri-deployments', deploymentData)
  }, [deploymentData])

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

  useEffect(() => {
    const map = mapRef.current
    const member = personnelRef.current.find((item) => item.id === followedPersonnelId)
    if (!map || !member) return
    const latitude = Number(member.latitude)
    const longitude = Number(member.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    map.flyTo({
      center: [longitude, latitude],
      zoom: mapMode === 'satellite' ? SATELLITE_FOCUS_ZOOM : STREET_FOCUS_ZOOM,
      pitch: threeDEnabled ? 52 : 0,
      duration: 1200,
      essential: true,
    })
  }, [followedPersonnelId, mapMode, threeDEnabled])

  useEffect(() => {
    if (!layoutVersion) return undefined
    const timer = window.setTimeout(() => {
      const map = mapRef.current
      map?.resize()
      const member = personnelRef.current.find((item) => item.id === followedPersonnelId)
      if (member) {
        map?.jumpTo({
          center: [Number(member.longitude), Number(member.latitude)],
          zoom: mapMode === 'satellite' ? SATELLITE_FOCUS_ZOOM : STREET_FOCUS_ZOOM,
        })
      } else {
        map?.jumpTo({ center: LIVE_MAP_DEFAULT_CENTER, zoom: LIVE_MAP_DEFAULT_ZOOM })
      }
    }, 280)
    return () => window.clearTimeout(timer)
  }, [followedPersonnelId, layoutVersion, mapMode])

  if (!hasMapTilerWebApiKey) {
    return (
      <section className="map-panel h-100">
        <div className="map-config-state">
          <strong>Map configuration needed</strong>
          <span>Add VITE_MAPTILER_API_KEY to the frontend environment.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="map-panel h-100">
      <div ref={containerRef} className="map-view" aria-label="Live personnel map" />
      <MapStyleControls
        mapMode={mapMode}
        threeDEnabled={threeDEnabled}
        onMapModeChange={setMapMode}
        onThreeDChange={setThreeDEnabled}
      />
      {followedPersonnel && (
        <div className="map-follow-status" role="status">
          <span>Following <strong>{followedPersonnel.name}</strong></span>
          <button type="button" onClick={onStopFollowing}>Stop</button>
        </div>
      )}
      <MapAttribution />
      {!mapReady && <div className="map-style-loading" role="status">Loading map style…</div>}
    </section>
  )
}

export default PersonnelMap
