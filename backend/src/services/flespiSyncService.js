const { GpsDeviceAssignment } = require('../models')
const { resolveLocationName } = require('./reverseGeocodingService')

const toRecordedAt = (value) => {
	const timestamp = Number(value)
	if (!Number.isFinite(timestamp) || timestamp <= 0) return null
	return new Date(timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000)
}

const createFlespiSyncService = ({ flespiService, personnelService }) => {
	const syncAssignedLocations = async () => {
		const assignments = await GpsDeviceAssignment.find({ status: 'active' }).lean()
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

			const result = await personnelService.ingestLocation({
				imei: assignment.imei,
				latitude: telemetry.latitude,
				longitude: telemetry.longitude,
				location_name: await resolveLocationName(
					telemetry.latitude,
					telemetry.longitude,
				),
				speed: Number.isFinite(telemetry.speed) ? telemetry.speed : undefined,
				heading: Number.isFinite(telemetry.heading) ? telemetry.heading : undefined,
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
