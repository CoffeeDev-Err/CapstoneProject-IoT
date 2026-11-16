const { isValidCoordinates } = require('./geo')
const { getLocationFreshness } = require('./locationFreshness')

// Unknown accuracy can be displayed, but cannot prove a distance-based event.
const isUsableGpsFix = (location, { now = new Date(), requireAccuracy = false, maxAccuracy = 100, notBefore } = {}) => {
	const coordinates = location?.location?.coordinates
	const time = new Date(location?.recordedAt || 0).getTime()
	return Boolean(location?.source === 'gps' && location.isSimulated !== true
		&& (!location.positionSource || ['gps', 'gnss'].includes(location.positionSource))
		&& Array.isArray(coordinates) && coordinates.length === 2
		&& isValidCoordinates(coordinates[1], coordinates[0])
		&& Number.isFinite(time) && time > 0
		&& (!notBefore || time >= +new Date(notBefore))
		&& !getLocationFreshness({ recordedAt: location.recordedAt, source: 'gps', now }).isLocationStale
		&& location.positionValid !== false
		&& (!Number.isFinite(location.satellites) || location.satellites >= 4)
		&& (!requireAccuracy || Number.isFinite(location.accuracy))
		&& (!Number.isFinite(location.accuracy) || (location.accuracy > 0 && location.accuracy <= maxAccuracy)))
}

const snapshotGpsFix = (location) => ({
	location: { type: 'Point', coordinates: [...location.location.coordinates] },
	recordedAt: new Date(location.recordedAt),
	deviceAssignmentId: location.deviceAssignmentId,
	source: location.source,
	positionSource: location.positionSource,
	accuracy: location.accuracy,
	positionValid: location.positionValid,
	satellites: location.satellites,
})

module.exports = { isUsableGpsFix, snapshotGpsFix }
