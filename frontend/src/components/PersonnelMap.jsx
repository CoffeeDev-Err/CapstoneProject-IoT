/**
 * Native WebGL live map for supervisor monitoring.
 * MapLibre owns the long-lived map instance while React updates its data,
 * controls, and accessible DOM markers without remounting the screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import Supercluster from 'supercluster'
import '../services/configureMapLibre'
import MapAttribution from './MapAttribution'
import MapLegend from './MapLegend'
import { SkeletonBlock } from './LoadingSkeleton'
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
  confirmedFixFromMember,
  interpolateLatLng,
  markerMotionForFixes,
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
  if (member.emergencyActive) return 'police-marker--backup'
  if (member.isInsideCabagan === false) return 'police-marker--boundary'
  if (member.operationActive) return 'police-marker--operation'
  return getMarkerStatusClass(member.status)
}

const getMarkerCue = (member) => {
  if (member.emergencyActive) return 'SOS'
  if (member.isInsideCabagan === false) return '!'
  if (member.operationActive) return 'OP'
  return '✓'
}

const getInitials = (name = '') => name
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase() || 'P'

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
  const initials = document.createElement('span')
  initials.className = 'police-marker__initials'
  initials.textContent = getInitials(member.name)
  initials.hidden = Boolean(photo.dataset.intendedSource)
  photo.hidden = !photo.dataset.intendedSource
  if (photo.dataset.intendedSource) photo.src = photo.dataset.intendedSource
  photo.addEventListener('error', () => {
    photo.hidden = true
    initials.hidden = false
  })

  const statusCue = document.createElement('span')
  statusCue.className = 'police-marker__status-cue'
  statusCue.textContent = getMarkerCue(member)

  photoFrame.append(photo)
  photoFrame.append(initials)
  pin.append(photoFrame)
  pin.append(statusCue)
  button.append(pin)
  button.addEventListener('click', () => onSelect())
  return { button, photo, initials, pin, statusCue }
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
      paint: { 'fill-color': '#f51212', 'fill-opacity': 0.12 },
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
        'line-color': '#f71616',
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
  isConnected = false,
  initialDataError = '',
  lastPersonnelSyncAt = '',
  onRetry,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [initialIsDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const markerStatesRef = useRef(new Map())
  const clusterMarkerStatesRef = useRef(new Map())
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
    clusterMarkerStatesRef.current.forEach((state) => {
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      state.marker.remove()
    })
    clusterMarkerStatesRef.current.clear()
  }, [])

  const renderClusters = useCallback(() => {
    const map = mapRef.current
    const index = clusterIndexRef.current
    if (!map || !index || !map.loaded()) return

    markerStatesRef.current.forEach((state) => {
      state.element.style.display = 'none'
    })

    const bounds = map.getBounds()
    const clusters = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      Math.max(0, Math.min(20, Math.floor(map.getZoom()))),
    )

    const activeClusterKeys = new Set()
    clusters.forEach((feature) => {
      if (!feature.properties.cluster) {
        const markerState = markerStatesRef.current.get(feature.properties.memberId)
        if (markerState) markerState.element.style.display = ''
        return
      }

      const memberIds = index
        .getLeaves(feature.properties.cluster_id, Infinity)
        .map((leaf) => String(leaf.properties.memberId))
        .sort()
      const clusterKey = memberIds.join('|')
      activeClusterKeys.add(clusterKey)
      const tone = feature.properties.backup > 0
        ? 'personnel-cluster--backup'
        : (feature.properties.boundary > 0
          ? 'personnel-cluster--boundary'
          : (feature.properties.operation > 0 ? 'personnel-cluster--operation' : 'personnel-cluster--duty'))
      const target = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]
      const animationDurationMs = Number(feature.properties.motionDuration) > 0
        ? Number(feature.properties.motionDuration)
        : MARKER_ANIMATION_DURATION_MS
      let state = clusterMarkerStatesRef.current.get(clusterKey)

      if (!state) {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = 'personnel-cluster-shell maplibre-personnel-cluster'
        const badge = document.createElement('span')
        element.append(badge)
        const marker = new maplibregl.Marker({ element })
          .setLngLat(feature.geometry.coordinates)
          .addTo(map)
        state = {
          marker,
          element,
          badge,
          currentPosition: target,
          targetPosition: target,
          expansionZoom: 18,
          animationFrame: null,
        }
        element.addEventListener('click', () => {
          const latest = clusterMarkerStatesRef.current.get(clusterKey)
          if (!latest) return
          map.easeTo({
            center: [latest.currentPosition[1], latest.currentPosition[0]],
            zoom: latest.expansionZoom,
            duration: 650,
          })
        })
        clusterMarkerStatesRef.current.set(clusterKey, state)
      }

      state.badge.className = `personnel-cluster ${tone}`
      state.badge.textContent = String(feature.properties.point_count)
      state.element.setAttribute('aria-label', `Zoom to ${feature.properties.point_count} grouped officers`)
      state.expansionZoom = Math.min(
        index.getClusterExpansionZoom(feature.properties.cluster_id),
        18,
      )
      const from = [...state.currentPosition]
      const targetUnchanged = state.targetPosition[0] === target[0]
        && state.targetPosition[1] === target[1]
      state.targetPosition = target
      if (targetUnchanged && state.animationFrame) return
      if (from[0] === target[0] && from[1] === target[1]) return
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      const startTime = performance.now()
      let lastRenderedAt = 0
      const tick = (now) => {
        const progress = Math.min((now - startTime) / animationDurationMs, 1)
        if (progress < 1 && now - lastRenderedAt < 1000 / 30) {
          state.animationFrame = requestAnimationFrame(tick)
          return
        }
        lastRenderedAt = now
        const nextPosition = interpolateLatLng(from, target, progress)
        state.currentPosition = nextPosition
        state.marker.setLngLat([nextPosition[1], nextPosition[0]])
        if (progress < 1) state.animationFrame = requestAnimationFrame(tick)
        else state.animationFrame = null
      }
      state.animationFrame = requestAnimationFrame(tick)
    })

    clusterMarkerStatesRef.current.forEach((state, clusterKey) => {
      if (activeClusterKeys.has(clusterKey)) return
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      state.marker.remove()
      clusterMarkerStatesRef.current.delete(clusterKey)
    })

    markerStatesRef.current.forEach((state) => {
      if (state.element.classList.contains('is-followed')) state.element.style.display = ''
    })
  }, [])

  const rebuildClusterIndex = useCallback(() => {
    const points = personnelRef.current
      .filter((member) => isValidPosition(member) && member.id !== followedPersonnelIdRef.current)
      .map((member) => {
        const markerState = markerStatesRef.current.get(member.id)
        const effectivePosition = markerState?.targetPosition
          || [Number(member.latitude), Number(member.longitude)]
        return ({
          type: 'Feature',
          properties: {
            memberId: member.id,
            backup: member.emergencyActive ? 1 : 0,
            boundary: member.isInsideCabagan === false ? 1 : 0,
            operation: member.operationActive ? 1 : 0,
            motionDuration: markerState?.motionDuration || 0,
          },
          geometry: {
            type: 'Point',
            coordinates: [effectivePosition[1], effectivePosition[0]],
          },
        })
      })

    clusterIndexRef.current = new Supercluster({
      radius: PERSONNEL_CLUSTER_RADIUS,
      maxZoom: PERSONNEL_CLUSTER_MAX_ZOOM,
      map: (properties) => ({
        backup: properties.backup,
        boundary: properties.boundary,
        operation: properties.operation,
        motionDuration: properties.motionDuration,
      }),
      reduce: (accumulated, properties) => {
        accumulated.backup += properties.backup
        accumulated.boundary += properties.boundary
        accumulated.operation += properties.operation
        accumulated.motionDuration = Math.max(
          accumulated.motionDuration,
          properties.motionDuration,
        )
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
          initials: markerElement.initials,
          pin: markerElement.pin,
          statusCue: markerElement.statusCue,
          member,
          currentPosition: [Number(member.latitude), Number(member.longitude)],
          targetPosition: [Number(member.latitude), Number(member.longitude)],
          confirmedFix: confirmedFixFromMember(member),
          motionDuration: 0,
          animationFrame: null,
        }
        markerStatesRef.current.set(member.id, state)
      }

      state.member = member
      state.element.classList.toggle('is-followed', member.id === followedPersonnelId)
      state.element.setAttribute('aria-label', `View ${member.name} on live map`)
      state.pin.className = `police-marker ${getMarkerClass(member)}`
      state.statusCue.textContent = getMarkerCue(member)
      state.statusCue.hidden = !state.statusCue.textContent
      const nextPhoto = member.photoUrl || ''
      if (state.photo.dataset.intendedSource !== nextPhoto) {
        state.photo.dataset.intendedSource = nextPhoto
        state.initials.textContent = getInitials(member.name)
        state.photo.hidden = !nextPhoto
        state.initials.hidden = Boolean(nextPhoto)
        if (nextPhoto) state.photo.src = nextPhoto
      }

      const confirmedFix = confirmedFixFromMember(member)
      const rawTarget = [confirmedFix.latitude, confirmedFix.longitude]
      const sameConfirmedFix = state.confirmedFix
        && state.confirmedFix.latitude === confirmedFix.latitude
        && state.confirmedFix.longitude === confirmedFix.longitude
        && state.confirmedFix.recordedAt === confirmedFix.recordedAt
      if (sameConfirmedFix) return

      const motion = markerMotionForFixes(state.confirmedFix, confirmedFix)
      const from = [...state.currentPosition]
      const target = motion.suppressJitter ? [...state.targetPosition] : rawTarget
      state.confirmedFix = confirmedFix
      state.targetPosition = target
      state.motionDuration = motion.durationMs
      if (from[0] === target[0] && from[1] === target[1]) return
      if (state.animationFrame) cancelAnimationFrame(state.animationFrame)
      if (member.id === followedPersonnelId) {
        map.easeTo({
          center: [target[1], target[0]],
          duration: motion.durationMs,
          essential: true,
        })
      }
      const startTime = performance.now()
      let lastRenderedAt = 0

      const tick = (now) => {
        const progress = Math.min((now - startTime) / motion.durationMs, 1)
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
      <MapLegend />
      <div className={`map-connection-badge${isConnected ? ' is-live' : ' is-offline'}`} role="status">
        <span aria-hidden="true" />
        {isConnected ? 'Live data' : 'Connection lost'}
        {lastPersonnelSyncAt && <small>Last sync {new Date(lastPersonnelSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
      </div>
      {initialDataError && (
        <div className="map-data-state map-data-state--error" role="alert">
          <strong>Some live data did not load</strong>
          <span>{initialDataError}</span>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      )}
      {!initialDataError && mapReady && personnel.length === 0 && (
        <div className="map-data-state" role="status">
          <strong>No active personnel to display</strong>
          <span>The map is working. Personnel will appear after a current GPS fix is received.</span>
        </div>
      )}
      {followedPersonnel && (
        <div className="map-follow-status" role="status">
          <span>Following <strong>{followedPersonnel.name}</strong></span>
          <button type="button" onClick={onStopFollowing}>Stop</button>
        </div>
      )}
      <MapAttribution />
      {!mapReady && (
        <div className="map-style-loading" role="status" aria-label="Loading map style">
          <SkeletonBlock width="5.5rem" height="0.65rem" />
        </div>
      )}
    </section>
  )
}

export default PersonnelMap
