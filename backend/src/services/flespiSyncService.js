const { Deployment, GpsDeviceAssignment } = require('../models')
const { getLocationFreshness } = require('../utils/locationFreshness')
const { formatCoordinates, resolveLocationName } = require('./reverseGeocodingService')

const toRecordedAt = (value) => {
	const timestamp = Number(value)
	if (!Number.isFinite(timestamp) || timestamp <= 0) return null
	return new Date(timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000)
}

const createFlespiSyncService = ({
	flespiService,
	personnelService,
	assignmentModel = GpsDeviceAssignment,
	deploymentModel = Deployment,
	clock = () => new Date(),
	resolveLocation = resolveLocationName,
	locationNameBudgetMs = 500,
}) => {
	const resolveLocationForLiveFix = async (latitude, longitude) => {
		let timeout
		try {
			return await Promise.race([
				Promise.resolve().then(() => resolveLocation(latitude, longitude))
					.catch(() => formatCoordinates(latitude, longitude)),
				new Promise((resolve) => {
					timeout = setTimeout(() => resolve(formatCoordinates(latitude, longitude)), locationNameBudgetMs)
				}),
			])
		} finally {
			clearTimeout(timeout)
		}
	}
	const syncAssignedLocations = async ({ deviceIds = [] } = {}) => {
		const selectedDeviceIds = [...new Set(deviceIds.map(String).filter(Boolean))]
		const now = clock()
		const onDutyPersonnelIds = await deploymentModel.distinct('personnelId', {
			status: 'active',
			$and: [
				{ $or: [{ shiftStart: { $exists: false } }, { shiftStart: null }, { shiftStart: { $lte: now } }] },
				{ $or: [{ shiftEnd: { $exists: false } }, { shiftEnd: null }, { shiftEnd: { $gt: now } }] },
			],
		})
		if (onDutyPersonnelIds.length === 0) {
			return { assignments: 0, accepted: 0, skipped: 0 }
		}
		const query = { status: 'active', personnelId: { $in: onDutyPersonnelIds } }
		if (selectedDeviceIds.length > 0) {
			query.flespiDeviceId = { $in: selectedDeviceIds }
		}

		const assignments = await assignmentModel.find(query).lean()
		if (assignments.length === 0) {
			return { assignments: 0, accepted: 0, skipped: 0 }
		}

		const telemetryRows = await flespiService.fetchLatestTelemetry({
			deviceIds: assignments.map((assignment) => assignment.flespiDeviceId),
		})
		const telemetryByDevice = new Map(
			telemetryRows.map((row) => [row.deviceId, row]),
		)

		let accepted = 0
		let skipped = 0

		await Promise.all(assignments.map(async (assignment) => {
			const telemetry = telemetryByDevice.get(String(assignment.flespiDeviceId))
			const recordedAt = toRecordedAt(telemetry?.recordedAt)
			if (
				!telemetry
				|| !Number.isFinite(telemetry.latitude)
				|| !Number.isFinite(telemetry.longitude)
				|| !recordedAt
				|| Number.isNaN(recordedAt.getTime())
			) {
				skipped += 1
				return
			}
			if (getLocationFreshness({ recordedAt, source: 'gps' }).isLocationStale) {
				skipped += 1
				return
			}

			const result = await personnelService.ingestLocation({
				imei: assignment.imei,
				latitude: telemetry.latitude,
				longitude: telemetry.longitude,
				// Place-name lookup must not hold live coordinates behind a geocoder queue.
				// The resolver continues populating its cache for later refreshes.
				location_name: await resolveLocationForLiveFix(
					telemetry.latitude,
					telemetry.longitude,
				),
				speed: Number.isFinite(telemetry.speed) ? telemetry.speed : undefined,
				heading: Number.isFinite(telemetry.heading) ? telemetry.heading : undefined,
				battery_level: Number.isFinite(telemetry.batteryLevel)
					? telemetry.batteryLevel
					: undefined,
				recorded_at: recordedAt.toISOString(),
				source: 'gps',
			})

			if (result.accepted) accepted += 1
			else skipped += 1
		}))

		return {
			assignments: assignments.length,
			accepted,
			skipped,
		}
	}

	return { syncAssignedLocations }
}

module.exports = createFlespiSyncService
