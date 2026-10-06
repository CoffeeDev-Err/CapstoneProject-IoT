// Display-only quality rules. Original report GPS snapshots remain unchanged.
const MAX_ACCURACY_METERS = 50
// Fixes may arrive at different intervals. Larger gaps
// cannot establish a travelled path, so draw separate segments.
const MAX_GAP_MS = 60 * 1000
const MAX_SPEED_METERS_PER_SECOND = 55
const optionalNumber = value => value == null || value === '' ? null : Number(value)
export const validRouteCoordinate = point => point && point.latitude != null && point.latitude !== ''
  && point.longitude != null && point.longitude !== '' && Number.isFinite(Number(point.latitude))
  && Number.isFinite(Number(point.longitude)) && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180

export const routeDistanceMeters = (a, b) => {
  const radians = degrees => degrees * Math.PI / 180
  const lat = radians(Number(b.latitude) - Number(a.latitude))
  const lon = radians(Number(b.longitude) - Number(a.longitude))
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(Number(a.latitude))) * Math.cos(radians(Number(b.latitude))) * Math.sin(lon / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export const routeBearing = (a, b) => {
  const radians = degrees => Number(degrees) * Math.PI / 180
  const delta = radians(b.longitude - a.longitude)
  const first = radians(a.latitude)
  const second = radians(b.latitude)
  return (Math.atan2(Math.sin(delta) * Math.cos(second),
    Math.cos(first) * Math.sin(second) - Math.sin(first) * Math.cos(second) * Math.cos(delta)) * 180 / Math.PI + 360) % 360
}

const probableTurns = segments => segments.flatMap(segment => segment.slice(1, -1).flatMap((middle, index) => {
  const before = segment[index]
  const after = segment[index + 2]
  const incomingDistance = routeDistanceMeters(before, middle)
  const outgoingDistance = routeDistanceMeters(middle, after)
  const accuracy = Math.max(...[before, middle, after].map(point => optionalNumber(point.accuracy) || 0))
  if (Math.min(incomingDistance, outgoingDistance) < Math.max(15, accuracy * 2)
    || [before, middle, after].every(point => optionalNumber(point.speed) === 0)) return []
  const incomingBearing = routeBearing(before, middle)
  const outgoingBearing = routeBearing(middle, after)
  const angle = ((outgoingBearing - incomingBearing + 540) % 360) - 180
  if (Math.abs(angle) < 45) return []
  return [{ latitude: Number(middle.latitude), longitude: Number(middle.longitude),
    recorded_at: middle.recorded_at, from: before.recorded_at, to: after.recorded_at,
    direction: Math.abs(angle) >= 150 ? 'reversal' : angle > 0 ? 'right' : 'left',
    angle: Math.round(Math.abs(angle)), incomingBearing, outgoingBearing, incomingDistance, outgoingDistance,
    accuracy_unknown: [before, middle, after].some(point => optionalNumber(point.accuracy) == null) }]
}))

export const buildReportRouteTrace = (points = []) => {
  const segments = []
  const sampleSegments = []
  let segment = []
  let previous = null
  let anchor = null
  let omitted = 0
  let simplified = 0
  let unknownAccuracy = 0
  const finishSegment = () => {
    if (segment.length > 1) {
      sampleSegments.push(segment)
      segments.push(segment.map(point => [Number(point.latitude), Number(point.longitude)]))
    }
    segment = []; previous = null; anchor = null
  }
  // Server snapshots are chronological. Never bridge missing or invalid timestamps.
  for (const point of points) {
    const accuracy = optionalNumber(point.accuracy)
    const time = Date.parse(point.recorded_at)
    if (!validRouteCoordinate(point) || !Number.isFinite(time) || point.position_valid === false
      || (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_METERS))) {
      omitted += 1; finishSegment(); continue
    }
    if (accuracy == null) unknownAccuracy += 1
    if (previous) {
      const elapsed = time - Date.parse(previous.recorded_at)
      const distance = routeDistanceMeters(previous, point)
      if (elapsed <= 0 || elapsed > MAX_GAP_MS || distance / (elapsed / 1000) > MAX_SPEED_METERS_PER_SECOND) finishSegment()
    }
    if (anchor) {
      const distance = routeDistanceMeters(anchor, point)
      // Small differences within recorded accuracy cannot establish movement.
      // When both fixes report zero speed, avoid depicting local GPS wander as travel.
      const stationary = optionalNumber(anchor.speed) === 0 && optionalNumber(point.speed) === 0
      const uncertainty = Math.max(stationary ? 50 : 3, Math.min(50, (optionalNumber(anchor.accuracy) || 0) + (accuracy || 0)))
      if (distance <= uncertainty) {
        simplified += 1; previous = point; continue
      }
    }
    segment.push(point)
    anchor = point; previous = point
  }
  finishSegment()
  return { segments, turns: probableTurns(sampleSegments), omitted, simplified, unknownAccuracy }
}
