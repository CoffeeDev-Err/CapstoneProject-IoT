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
import { CABAGAN_BOUNDARY_COORDS, CABAGAN_CENTER } from '../utils/cabaganGeofence'

const OUTER_MASK_BOUNDS = [
  [18.2, 120.8],
  [18.2, 122.8],
  [16.2, 122.8],
  [16.2, 120.8],
]

const OUTSIDE_MASK_STYLE = {
  fillColor: '#d97706',
  fillOpacity: 0.12,
  stroke: false,
  fillRule: 'evenodd',
}

const GEOFENCE_BORDER_STYLE = {
  color: '#d97706',
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
 *   On Duty / On Patrol  -> green border
 *   Ongoing Case         -> red border
 * Extra mappings are included so the current sample statuses still render
 * meaningfully without changing the backend vocabulary.
 */
const getMarkerStatusClass = (status = '') => {
  const normalized = status.toLowerCase()

  if (normalized.includes('on duty') || normalized.includes('on patrol')) {
    return 'police-marker--on-duty'
  }

  if (normalized.includes('ongoing case') || normalized.includes('responding') || normalized.includes('alert')) {
    return 'police-marker--ongoing-case'
  }

  if (normalized.includes('monitor')) {
    return 'police-marker--monitoring'
  }

  return 'police-marker--default'
}

const getMarkerClass = (member) => {
  if (member.isInsideCabagan === false) {
    return 'police-marker--out-of-boundary'
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

/**
 * SmoothMarker
 * Creates a Leaflet marker imperatively and animates it between GPS updates
 * using requestAnimationFrame + ease-out interpolation instead of teleporting.
 * Must be rendered inside a <MapContainer> so useMap() is available.
 */
function SmoothMarker({ member, onSelect }) {
  const map = useMap()
  const markerRef = useRef(null)
  const animFrameRef = useRef(null)
  const currentPosRef = useRef([member.latitude, member.longitude])

  // Rebuild icon only when visually relevant fields change, not every GPS tick
  const icon = useMemo(
    () => createPoliceMarkerIcon(member),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member.status, member.isInsideCabagan, member.photoUrl, member.name],
  )

  // Mount: create the raw Leaflet marker once and add it to the map
  useEffect(() => {
    const marker = L.marker(currentPosRef.current, { icon })
    marker.addTo(map)
    markerRef.current = marker

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      marker.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally runs once on mount only

  // Sync icon when status or boundary flag changes
  useEffect(() => {
    markerRef.current?.setIcon(icon)
  }, [icon])

  // Keep the click handler pointing at the latest member object
  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
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

    // Duration is slightly under the 1.5 s server broadcast interval so the
    // marker is always visibly moving and reaches the target before the next update
    const DURATION = 1400

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const startTime = performance.now()

    const tick = (now) => {
      const t = Math.min((now - startTime) / DURATION, 1)
      const ease = 1 - (1 - t) ** 3 // ease-out cubic — fast start, smooth finish
      const lat = from[0] + (to[0] - from[0]) * ease
      const lng = from[1] + (to[1] - from[1]) * ease
      currentPosRef.current = [lat, lng]
      marker.setLatLng([lat, lng])
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

        {/* SmoothMarker animates each officer between GPS updates via rAF */}
        {personnel.map((member) => (
          <SmoothMarker
            key={member.id}
            member={member}
            onSelect={onSelectPersonnel}
          />
        ))}
      </MapContainer>
    </section>
  )
}

export default PersonnelMap
