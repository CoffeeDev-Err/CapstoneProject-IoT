const DEFAULT_STALE_SECONDS = 120
const MINIMUM_STALE_SECONDS = 30
const FUTURE_TOLERANCE_MS = 5 * 60_000

const getLocationStaleThresholdMs = () => {
	const configuredSeconds = Number(process.env.GPS_LOCATION_STALE_SECONDS)
	const staleSeconds = Number.isFinite(configuredSeconds)
		? Math.max(MINIMUM_STALE_SECONDS, configuredSeconds)
		: DEFAULT_STALE_SECONDS

	return staleSeconds * 1000
}

const getLocationFreshness = ({ recordedAt, source, now = new Date() } = {}) => {
	const recordedTime = recordedAt instanceof Date
		? recordedAt.getTime()
		: new Date(recordedAt || 0).getTime()
	const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
	const isGpsLocation = source === 'gps'
	const hasValidTimestamp = Number.isFinite(recordedTime) && recordedTime > 0
	const ageMs = hasValidTimestamp && Number.isFinite(nowTime)
		? nowTime - recordedTime
		: Number.POSITIVE_INFINITY
	const isLocationStale = isGpsLocation && (
		!hasValidTimestamp
		|| ageMs > getLocationStaleThresholdMs()
		|| ageMs < -FUTURE_TOLERANCE_MS
	)

	return {
		isLocationStale,
		locationAgeSeconds: Number.isFinite(ageMs)
			? Math.max(0, Math.floor(ageMs / 1000))
			: null,
		locationRecordedAt: hasValidTimestamp ? new Date(recordedTime) : null,
	}
}

module.exports = {
	getLocationFreshness,
	getLocationStaleThresholdMs,
}
