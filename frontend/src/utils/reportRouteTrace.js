// Display-only quality rules. Original report GPS snapshots remain unchanged.
const MAX_ACCURACY_METERS = 50
// History is sampled at ten seconds (older records at thirty). Larger gaps
// cannot establish a travelled path, so draw separate segments.
const MAX_GAP_MS = 60 * 1000
const MAX_SPEED_METERS_PER_SECOND = 55
const optionalNumber = value => value == null || value === '' ? null : Number(value)
export const validRouteCoordinate = point => point && point.latitude != null && point.latitude !== ''
  && point.longitude != null && point.longitude !== '' && Number.isFinite(Number(point.latitude))
  && Number.isFinite(Number(point.longitude)) && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180

const distanceMeters = (a, b) => {
  const radians = degrees => degrees * Math.PI / 180
  const lat = radians(Number(b.latitude) - Number(a.latitude))
  const lon = radians(Number(b.longitude) - Number(a.longitude))
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(Number(a.latitude))) * Math.cos(radians(Number(b.latitude))) * Math.sin(lon / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export const buildReportRouteTrace = (points = []) => {
  const segments = []
  let segment = []
  let previous = null
  let anchor = null
  let omitted = 0
  let simplified = 0
  let unknownAccuracy = 0
  const finishSegment = () => {
    if (segment.length > 1) segments.push(segment)
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
      const distance = distanceMeters(previous, point)
      if (elapsed <= 0 || elapsed > MAX_GAP_MS || distance / (elapsed / 1000) > MAX_SPEED_METERS_PER_SECOND) finishSegment()
    }
    if (anchor) {
      const distance = distanceMeters(anchor, point)
      // Small differences within recorded accuracy cannot establish movement.
      // When both fixes report zero speed, avoid depicting local GPS wander as travel.
      const stationary = optionalNumber(anchor.speed) === 0 && optionalNumber(point.speed) === 0
      const uncertainty = Math.max(stationary ? 50 : 3, Math.min(50, (optionalNumber(anchor.accuracy) || 0) + (accuracy || 0)))
      if (distance <= uncertainty) {
        simplified += 1; previous = point; continue
      }
    }
    segment.push([Number(point.latitude), Number(point.longitude)])
    anchor = point; previous = point
  }
  finishSegment()
  return { segments, omitted, simplified, unknownAccuracy }
}
