/**
 * PersonnelMap.jsx — Leaflet Map with Live GPS Markers
 *
 * Renders an interactive Leaflet map centred on Cabagan, Isabela and places
 * an animated circular blue marker for every officer being tracked.
 * Clicking any marker calls onSelectPersonnel so MonitoringPage can open
 * the ProfileModal with that officer's details.
 *
 * Props:
 *   personnel         {Array}    — live officer list from PersonnelContext
 *   onSelectPersonnel {Function} — callback invoked with the clicked officer object
 *
 * Map details:
 *   Center tile: 17.4227°N, 121.7701°E (Cabagan, Isabela, Philippines)
 *   Tile source: OpenStreetMap — free, no API key required
 *   Marker:      Custom L.divIcon so the pulsing CSS animation applies correctly
 */
import { Circle, MapContainer, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { CABAGAN_BOUNDARY_COORDS, CABAGAN_CENTER } from '../utils/cabaganGeofence'
import {
  MARKER_ANIMATION_DURATION_MS,
  interpolateLatLng,
} from '../utils/mapMotion'

const OUTER_MASK_BOUNDS = [
  [18.2, 120.8],
  [18.2, 122.8],
  [16.2, 122.8],
  [16.2, 120.8],
]

const OUTSIDE_MASK_STYLE = {
  fillColor: '#dc2626',
  fillOpacity: 0.12,
  stroke: false,
  fillRule: 'evenodd',
}

const GEOFENCE_BORDER_STYLE = {
  color: '#dc2626',
  weight: 2,
  fillOpacity: 0,
  dashArray: '8 7',
}

const LIVE_MAP_DEFAULT_CENTER = CABAGAN_CENTER
const LIVE_MAP_DEFAULT_ZOOM = 11.8

const focusCabaganView = (map, animate = false) => {
  map.setView(LIVE_MAP_DEFAULT_CENTER, LIVE_MAP_DEFAULT_ZOOM, {
    animate,
  })
}

function FocusCabaganOnLoad() {
  const map = useMap()

  useEffect(() => {
    focusCabaganView(map)

    const handleFocusLiveMap = () => {
      map.invalidateSize()
      focusCabaganView(map, true)
    }

    window.addEventListener('focus-live-map', handleFocusLiveMap)

    return () => {
      window.removeEventListener('focus-live-map', handleFocusLiveMap)
    }
  }, [map])

  return null
}

function FocusCabaganOnLayoutChange({ layoutVersion }) {
  const map = useMap()

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const mapContainer = map.getContainer()
    let resizeFrame = 0
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        map.invalidateSize({
          debounceMoveend: true,
          pan: false,
        })
      })
    })

    resizeObserver.observe(mapContainer)

    return () => {
      window.cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
    }
  }, [map])

  useEffect(() => {
    if (!layoutVersion) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize({ pan: false })
      focusCabaganView(map)
    }, 280)

    return () => {
      window.clearTimeout(timer)
    }
  }, [layoutVersion, map])

  return null
}

function FocusPersonnelOnLocate({ focusTarget }) {
  const map = useMap()

  useEffect(() => {
    if (!focusTarget) {
      return
    }

    const latitude = Number(focusTarget.latitude)
    const longitude = Number(focusTarget.longitude)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return
    }

    map.flyTo([latitude, longitude], 19, {
      animate: true,
      duration: 1.5,
    })
  }, [focusTarget, map])

  return null
}
/**
 * Converts the current personnel status to a visual marker class.
 * Requested mapping:
 *   On Duty / On Patrol  -> royal-blue border
 *   Active operation     -> cyan-blue border
 *   Emergency / boundary -> red border
 * Extra mappings are included so the current sample statuses still render
 * meaningfully without changing the backend vocabulary.
 */
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
  if (member.isInsideCabagan === false || member.emergencyActive) {
    return 'police-marker--out-of-boundary'
  }

  if (member.operationActive) {
    return 'police-marker--operation'
  }

  return getMarkerStatusClass(member.status)
}

/**
 * Builds a custom Leaflet divIcon containing the officer photo itself.
 * This produces a marker closer to the screenshot: circular portrait,
 * colored status ring, and a small pointer at the bottom.
 */
const createPoliceMarkerIcon = (member) => {
  const statusClass = getMarkerClass(member)
  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=1d4ed8&color=fff&size=96`

  return L.divIcon({
    className: 'police-marker-shell',
    html: `
      <div class="police-marker ${statusClass}">
        <div class="police-marker__photo-frame">
          <img
            class="police-marker__photo"
            src="${member.photoUrl || fallbackUrl}"
            alt="${member.name}"
            onerror="this.onerror=null;this.src='${fallbackUrl}'"
          />
        </div>
      </div>
    `,
    iconSize: [38, 44],
    iconAnchor: [19, 40],
    popupAnchor: [0, -36],
  })
}

const getClusterTone = (markers) => {
  const members = markers.map((marker) => marker.options.personnel)
  if (members.some((member) => member?.isInsideCabagan === false || member?.emergencyActive)) {
    return 'personnel-cluster--critical'
  }
  if (members.some((member) => member?.operationActive)) {
    return 'personnel-cluster--operation'
  }
  return 'personnel-cluster--duty'
}

/**
 * SmoothMarker
 * Creates a Leaflet marker imperatively and animates it between GPS updates
 * using requestAnimationFrame + ease-out interpolation instead of teleporting.
 * Must be rendered inside a <MapContainer> so useMap() is available.
 */
function SmoothMarker({ clusterGroup, member, onSelect }) {
  const markerRef = useRef(null)
  const animFrameRef = useRef(null)
  const currentPosRef = useRef([member.latitude, member.longitude])

  // Rebuild icon only when visually relevant fields change, not every GPS tick
  const icon = useMemo(
    () => createPoliceMarkerIcon(member),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      member.status,
      member.isInsideCabagan,
      member.emergencyActive,
      member.operationActive,
      member.photoUrl,
      member.name,
    ],
  )

  // Mount: create the raw Leaflet marker once and add it to the map
  useEffect(() => {
    const marker = L.marker(currentPosRef.current, { icon, personnel: member })
    marker.addTo(clusterGroup)
    markerRef.current = marker

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      clusterGroup.removeLayer(marker)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally runs once on mount only

  // Sync icon when status or boundary flag changes
  useEffect(() => {
    if (!markerRef.current) return
    markerRef.current.options.personnel = {
      ...markerRef.current.options.personnel,
      status: member.status,
      isInsideCabagan: member.isInsideCabagan,
      emergencyActive: member.emergencyActive,
      operationActive: member.operationActive,
    }
    markerRef.current.setIcon(icon)
    clusterGroup.refreshClusters(markerRef.current)
  }, [
    clusterGroup,
    icon,
    member.emergencyActive,
    member.isInsideCabagan,
    member.operationActive,
    member.status,
  ])

  // Keep the click handler pointing at the latest member object
  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    marker.options.personnel = member
    marker.off('click')
    marker.on('click', () => onSelect(member))
  }, [member, onSelect])

  // Animate smoothly to the new GPS coordinates on every position update
  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return

    const from = currentPosRef.current.slice()
    const to = [member.latitude, member.longitude]

    // No movement — skip animation
    if (from[0] === to[0] && from[1] === to[1]) return

    // Short enough to stay responsive while still hiding abrupt GPS jumps.
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const startTime = performance.now()
    let lastRenderedAt = 0

    const tick = (now) => {
      const t = Math.min((now - startTime) / MARKER_ANIMATION_DURATION_MS, 1)
      if (t < 1 && now - lastRenderedAt < 1000 / 30) {
        animFrameRef.current = requestAnimationFrame(tick)
        return
      }
      lastRenderedAt = now
      const nextPosition = interpolateLatLng(from, to, t)
      currentPosRef.current = nextPosition
      marker.setLatLng(nextPosition)
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick)
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [member.latitude, member.longitude])

  return null
}

function ClusteredPersonnelMarkers({ personnel, onSelect }) {
  const map = useMap()
  const clusterGroup = useMemo(() => L.markerClusterGroup({
    animate: true,
    animateAddingMarkers: true,
    chunkedLoading: true,
    disableClusteringAtZoom: 18,
    maxClusterRadius: 56,
    removeOutsideVisibleBounds: true,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    spiderLegPolylineOptions: { color: '#2563eb', opacity: 0.55, weight: 1.5 },
    iconCreateFunction: (cluster) => L.divIcon({
      className: 'personnel-cluster-shell',
      html: `<div class="personnel-cluster ${getClusterTone(cluster.getAllChildMarkers())}"><span>${cluster.getChildCount()}</span></div>`,
      iconSize: [46, 46],
    }),
  }), [])

  useEffect(() => {
    map.addLayer(clusterGroup)
    return () => map.removeLayer(clusterGroup)
  }, [clusterGroup, map])

  return personnel.map((member) => (
    <SmoothMarker
      key={member.id}
      clusterGroup={clusterGroup}
      member={member}
      onSelect={onSelect}
    />
  ))
}

function PersonnelMap({ personnel, deployments = [], onSelectPersonnel, focusTarget, layoutVersion = 0 }) {
  const deploymentGroups = useMemo(() => {
    const groups = new Map()

    deployments
      .filter((assignment) => assignment.isCurrentShift !== false)
      .forEach((assignment) => {
      const latitude = Number(assignment.latitude)
      const longitude = Number(assignment.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

      const key = assignment.groupId || assignment.patrolArea
      const group = groups.get(key) || {
        key,
        patrolArea: assignment.patrolArea,
        latitude,
        longitude,
        personnelNames: [],
      }
      group.personnelNames.push(assignment.personnelName)
      groups.set(key, group)
      })

    return [...groups.values()]
  }, [deployments])

  return (
    <section className="map-panel h-100">
      {/*
        MapContainer is mounted once and never re-mounts — Leaflet manages
        its own internal state. Markers are updated by React re-rendering
        the <Marker> components with new position props.
      */}
      <MapContainer
        center={CABAGAN_CENTER}
        zoom={14}
        maxZoom={19}
        scrollWheelZoom
        zoomAnimation
        fadeAnimation
        markerZoomAnimation
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelDebounceTime={25}
        wheelPxPerZoomLevel={90}
        className="map-view"
      >
        <FocusCabaganOnLoad />
        <FocusCabaganOnLayoutChange layoutVersion={layoutVersion} />
        <FocusPersonnelOnLocate focusTarget={focusTarget} />

        {/* OpenStreetMap tile layer — loads the map imagery */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxNativeZoom={19}
          maxZoom={19}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polygon positions={[OUTER_MASK_BOUNDS, CABAGAN_BOUNDARY_COORDS]} pathOptions={OUTSIDE_MASK_STYLE} />
        <Polygon
          positions={CABAGAN_BOUNDARY_COORDS}
          pathOptions={GEOFENCE_BORDER_STYLE}
        >
          <Tooltip sticky direction="top">
            Cabagan Geofence Boundary
          </Tooltip>
        </Polygon>

        {deploymentGroups.map((group) => (
          <Circle
            key={group.key}
            center={[group.latitude, group.longitude]}
            radius={320}
            pathOptions={{
              color: '#2563eb',
              weight: 2,
              fillColor: '#2563eb',
              fillOpacity: 0.1,
              dashArray: '7 6',
            }}
          />
        ))}

        <ClusteredPersonnelMarkers personnel={personnel} onSelect={onSelectPersonnel} />
      </MapContainer>
    </section>
  )
}

export default PersonnelMap
