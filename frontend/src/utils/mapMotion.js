export const GPS_UPDATE_INTERVAL_MS = 10_000
export const WALKING_MARKER_ANIMATION_DURATION_MS = 2_000
export const VEHICLE_MARKER_ANIMATION_DURATION_MS = 900
export const STATIONARY_JITTER_DISTANCE_METERS = 5
export const STATIONARY_SPEED_MAX_KMH = 2
export const VEHICLE_SPEED_MIN_KMH = 10

// Kept as the default/maximum duration for callers that do not have a
// timestamped officer fix (for example, a map-only cluster transition).
export const MARKER_ANIMATION_DURATION_MS = WALKING_MARKER_ANIMATION_DURATION_MS

const EARTH_RADIUS_METERS = 6_371_000
const MAX_REASONABLE_SPEED_KMH = 300
const MIN_SPEED_SAMPLE_MS = 1_000
const MAX_SPEED_SAMPLE_MS = 5 * 60_000

const validSpeed = (value) => {
  if (value === null || value === undefined || value === '') return null
  const speed = Number(value)
  return Number.isFinite(speed) && speed >= 0 && speed <= MAX_REASONABLE_SPEED_KMH
    ? speed
    : null
}

const timestampMs = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export const confirmedFixFromMember = (member) => ({
  latitude: Number(member?.latitude),
  longitude: Number(member?.longitude),
  recordedAt: member?.locationRecordedAt || member?.lastUpdated || null,
  speed: validSpeed(member?.speed),
})

export const distanceMetersBetweenFixes = (from, target) => {
  const fromLatitude = Number(from?.latitude)
  const fromLongitude = Number(from?.longitude)
  const targetLatitude = Number(target?.latitude)
  const targetLongitude = Number(target?.longitude)
  if (![fromLatitude, fromLongitude, targetLatitude, targetLongitude].every(Number.isFinite)) return null

  const toRadians = (degrees) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(targetLatitude - fromLatitude)
  const longitudeDelta = toRadians(targetLongitude - fromLongitude)
  const fromLatitudeRadians = toRadians(fromLatitude)
  const targetLatitudeRadians = toRadians(targetLatitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitudeRadians) * Math.cos(targetLatitudeRadians)
      * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

export const calculatedSpeedKmhBetweenFixes = (from, target) => {
  const fromTime = timestampMs(from?.recordedAt)
  const targetTime = timestampMs(target?.recordedAt)
  const elapsedMs = targetTime !== null && fromTime !== null ? targetTime - fromTime : null
  const distanceMeters = distanceMetersBetweenFixes(from, target)
  if (
    elapsedMs === null
    || elapsedMs < MIN_SPEED_SAMPLE_MS
    || elapsedMs > MAX_SPEED_SAMPLE_MS
    || distanceMeters === null
  ) return null

  return validSpeed((distanceMeters / elapsedMs) * 3_600)
}

export const resolveMotionSpeedKmh = (from, target) => {
  const reportedSpeed = validSpeed(target?.speed)
  const calculatedSpeed = calculatedSpeedKmhBetweenFixes(from, target)
  if (calculatedSpeed === null) return reportedSpeed
  if (reportedSpeed === null) return calculatedSpeed

  // A tracker speed is an instantaneous sample while position delta is the
  // average over two confirmed fixes. Prefer the reported value when they are
  // reasonably close, but reject it when the disagreement indicates noise.
  const tolerance = Math.max(8, calculatedSpeed * 0.6)
  return Math.abs(reportedSpeed - calculatedSpeed) > tolerance
    ? calculatedSpeed
    : reportedSpeed
}

export const markerMotionForFixes = (from, target) => {
  if (!from) return { durationMs: 0, distanceMeters: 0, speedKmh: null, suppressJitter: false }

  const distanceMeters = distanceMetersBetweenFixes(from, target)
  const calculatedSpeed = calculatedSpeedKmhBetweenFixes(from, target)
  const speedKmh = resolveMotionSpeedKmh(from, target)
  const suppressJitter = distanceMeters !== null
    && distanceMeters <= STATIONARY_JITTER_DISTANCE_METERS
    && (calculatedSpeed ?? speedKmh ?? 0) <= STATIONARY_SPEED_MAX_KMH

  return {
    durationMs: speedKmh !== null && speedKmh > VEHICLE_SPEED_MIN_KMH
      ? VEHICLE_MARKER_ANIMATION_DURATION_MS
      : WALKING_MARKER_ANIMATION_DURATION_MS,
    distanceMeters,
    speedKmh,
    suppressJitter,
  }
}

export const easeOutCubic = (progress) => {
  const constrainedProgress = Math.max(0, Math.min(1, progress))
  return 1 - (1 - constrainedProgress) ** 3
}

export const interpolateLatLng = (from, target, progress) => {
  const interpolatedProgress = Math.max(0, Math.min(1, progress))
  return [
    from[0] + (target[0] - from[0]) * interpolatedProgress,
    from[1] + (target[1] - from[1]) * interpolatedProgress,
  ]
}
