import municipality from '../../../contracts/geography/cabagan-municipality.source.json'

/**
 * cabaganGeofence.js
 *
 * Municipal boundary polygon for Cabagan, Isabela.
 * Coordinates are [latitude, longitude] and are used for:
 * 1) Drawing the visible red geofence line on the map
 * 2) Checking whether tracked personnel are inside Cabagan
 */

export const CABAGAN_CENTER = [17.3928, 121.8290]

// Compatibility view of the downloaded municipality; exclude its closing point.
export const CABAGAN_BOUNDARY_COORDS = municipality.features[0].geometry.coordinates[0]
  .slice(0, -1).map(([longitude, latitude]) => [latitude, longitude])

const toLngLat = ([lat, lng]) => [lng, lat]

const isPointOnSegment = (point, start, end) => {
  const [x, y] = point
  const [x1, y1] = start
  const [x2, y2] = end

  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1)
  if (Math.abs(cross) > 1e-12) {
    return false
  }

  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)
  if (dot < 0) {
    return false
  }

  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2
  return dot <= squaredLength
}

const isInsidePolygon = (point, polygon) => {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i]
    const previous = polygon[j]

    if (isPointOnSegment(point, previous, current)) {
      return true
    }

    const [xi, yi] = current
    const [xj, yj] = previous

    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

const CABAGAN_BOUNDARY_LNGLAT = CABAGAN_BOUNDARY_COORDS.map(toLngLat)

export const isInsideCabagan = (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false
  }

  return isInsidePolygon([longitude, latitude], CABAGAN_BOUNDARY_LNGLAT)
}
