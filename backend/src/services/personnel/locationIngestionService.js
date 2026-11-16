const { createHash } = require('node:crypto')
const { distanceInMeters, point } = require('../../utils/geo')
const { OPERATIONAL_LIMITS, createValidationError, validateOptionalNumber, validateText } = require('../../utils/operationalValidation')
const { getLocationFreshness } = require('../../utils/locationFreshness')
const createGpsFixGuard = require('./gpsFixGuard')
const { snapshotDuty } = require('./dutyGpsHistoryService')

const createLocationIngestionService = ({ models, currentShiftFilter, serializePersonnel, dutyHistoryService, clock = () => new Date() }) => {
	const { CurrentLocation, Deployment, GpsDeviceAssignment, LocationHistory, Personnel } = models
	const gpsFixGuard = createGpsFixGuard({ clock: () => clock().getTime() })
	const queues = new Map()

	const ingest = async (payload) => {
		const now = clock()
		const imei = String(payload.imei || '').trim()
		if (!/^\d{8,20}$/.test(imei)) throw createValidationError('An assigned 8-20 digit GPS IMEI is required.', 'imei', 'ASSIGNED_IMEI_REQUIRED')
		if ((payload.source && payload.source !== 'gps') || payload.isSimulated === true || payload.is_simulated === true) {
			throw createValidationError('Only real GPS readings are supported.', 'source')
		}
		const assignment = await GpsDeviceAssignment.findOne({ imei, status: 'active' }).lean()
		if (!assignment) throw createValidationError('This GPS IMEI is not assigned to an active personnel account.', 'imei', 'GPS_ASSIGNMENT_NOT_FOUND')
		const personnelId = assignment.personnelId
		if (payload.personnel_id && String(payload.personnel_id).trim() !== personnelId) {
			throw createValidationError('The submitted personnel ID does not match the assigned GPS device.', 'personnel_id', 'GPS_PERSONNEL_MISMATCH')
		}
		const [profile, activeDeployment] = await Promise.all([
			Personnel.findOne({ personnelId, status: 'active' }).lean(),
			Deployment.findOne(currentShiftFilter(now, { personnelId }))
				.select('_id assignmentId personnelId personnelName rank deploymentType patrolMode patrolArea shiftStart shiftEnd').lean(),
		])
		if (!profile) { const error = new Error('Active personnel profile not found.'); error.status = 404; throw error }
		const latitude = Number(payload.latitude), longitude = Number(payload.longitude)
		if ([payload.latitude, payload.longitude].some(value => value == null || typeof value === 'boolean' || String(value).trim() === '')
			|| !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
			throw createValidationError('Valid latitude and longitude are required.', 'location')
		}
		if (!payload.recorded_at || typeof payload.recorded_at !== 'string' || !payload.recorded_at.trim()) {
			throw createValidationError('The GPS measurement time (recorded_at) is required.', 'recorded_at', 'GPS_TIMESTAMP_REQUIRED')
		}
		const recordedAt = new Date(payload.recorded_at)
		if (!Number.isFinite(+recordedAt) || +recordedAt <= 0) throw createValidationError('recorded_at must be a valid date.', 'recorded_at')
		if (+recordedAt > +now + 5 * 60_000) throw createValidationError('recorded_at cannot be more than five minutes in the future.', 'recorded_at')
		if (getLocationFreshness({ recordedAt, source: 'gps', now }).isLocationStale) {
			throw createValidationError('The GPS reading is too old to update the live location.', 'recorded_at', 'STALE_GPS_READING')
		}
		const receivedAt = payload.received_at ? new Date(payload.received_at) : now
		if (!Number.isFinite(+receivedAt)) throw createValidationError('received_at must be a valid date.', 'received_at')
		const speed = validateOptionalNumber(payload.speed, { field: 'speed', label: 'Speed', min: 0, max: 300 })
		const heading = validateOptionalNumber(payload.heading, { field: 'heading', label: 'Heading', min: 0, max: 359.999 })
		const batteryLevel = validateOptionalNumber(payload.battery_level, { field: 'battery_level', label: 'Battery level', min: 0, max: 100 })
		const accuracy = validateOptionalNumber(payload.accuracy, { field: 'accuracy', label: 'GPS accuracy', min: 0.1, max: 5000 })
		const positionValid = payload.position_valid ?? undefined
		if (positionValid !== undefined && typeof positionValid !== 'boolean') throw createValidationError('GPS validity must be a boolean.', 'position_valid')
		const positionSource = String(payload.position_source || 'gnss').trim().toLowerCase()
		const satellites = validateOptionalNumber(payload.satellites, { field: 'satellites', label: 'Satellite count', min: 0, max: 255 })
		if (satellites !== undefined && !Number.isInteger(satellites)) throw createValidationError('Satellite count must be a whole number.', 'satellites')
		const locationName = validateText(payload.location_name, { field: 'location_name', label: 'Location name', maxLength: OPERATIONAL_LIMITS.locationName, allowNewlines: false })
		const current = await CurrentLocation.findOne({ personnelId })
		const result = (location, accepted, reason, historySampled = false) => ({
			personnel: serializePersonnel(profile, location, { isOnDuty: Boolean(activeDeployment), activeDeployment }),
			accepted, ...(reason && { reason }), historySampled,
		})
		if (!activeDeployment) { gpsFixGuard.clear(personnelId); return result(current, false, 'off_duty') }
		if ((assignment.assignedAt && recordedAt < assignment.assignedAt)
			|| (activeDeployment.shiftStart && recordedAt < activeDeployment.shiftStart)) return result(current, false, 'before_assignment')
		if (positionValid === false || !['gps', 'gnss'].includes(positionSource)) {
			gpsFixGuard.clear(personnelId)
			return result(current, false, 'invalid_gps_fix')
		}
		const sameAssignment = current?.deviceAssignmentId === assignment.assignmentId
		if (current?.source === 'gps' && recordedAt <= current.recordedAt) {
			const sameFix = sameAssignment && +recordedAt === +current.recordedAt
				&& current.location?.coordinates?.[0] === longitude && current.location?.coordinates?.[1] === latitude
			const telemetryChanged = sameFix && ((speed !== undefined && speed !== current.speed)
				|| (heading !== undefined && heading !== current.heading) || (batteryLevel !== undefined && batteryLevel !== current.batteryLevel))
			if (sameFix && (telemetryChanged || (locationName && locationName !== current.locationName))) {
				const fields = { receivedAt, speed, heading, batteryLevel, ...(locationName && { locationName }) }
				const refreshed = await CurrentLocation.findOneAndUpdate(
					{ personnelId, deviceAssignmentId: assignment.assignmentId, recordedAt },
					{ $set: Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) },
					{ returnDocument: 'after' },
				)
				return result(refreshed || await CurrentLocation.findOne({ personnelId }), Boolean(refreshed),
					refreshed ? (telemetryChanged ? 'telemetry_refreshed' : 'location_name_refreshed') : 'stale_location')
			}
			return result(current, false, 'stale_location')
		}
		const rejection = gpsFixGuard.check({ personnelId, assignmentId: assignment.assignmentId, current,
			fix: { coordinates: [longitude, latitude], recordedAt, speed, accuracy, satellites } })
		if (rejection) return result(current, false, rejection)

		const location = point(longitude, latitude)
		const sameDuty = sameAssignment && (!activeDeployment.shiftStart || +current.recordedAt >= +activeDeployment.shiftStart)
		const anchor = sameDuty ? current?.movementAnchor || current?.location : null
		const anchorAccuracy = sameDuty ? current?.movementAnchorAccuracy ?? current?.accuracy : undefined
		const movementThreshold = Math.max(5, Number(process.env.MOVEMENT_THRESHOLD_METERS) || 20,
			(Number.isFinite(anchorAccuracy) ? anchorAccuracy : 0) + (accuracy || 0))
		const hasMoved = !anchor || distanceInMeters(anchor.coordinates, location.coordinates) >= movementThreshold
		const nextLocation = {
			personnelId, deviceAssignmentId: assignment.assignmentId, locationName: locationName || '',
			location, accuracy, positionValid, positionSource, satellites, speed, heading, batteryLevel,
			source: 'gps', isSimulated: false, recordedAt, receivedAt,
			movementAnchor: hasMoved ? location : anchor,
			movementAnchorAccuracy: hasMoved ? accuracy : anchorAccuracy,
			lastMovedAt: hasMoved ? recordedAt : current?.lastMovedAt || current?.recordedAt || recordedAt,
			inactivityAlertedAt: hasMoved ? null : current?.inactivityAlertedAt,
		}
		const sample = {
			personnelId, deviceAssignmentId: assignment.assignmentId,
			...(activeDeployment.assignmentId && { deploymentId: activeDeployment.assignmentId, duty: snapshotDuty(activeDeployment, profile) }),
			locationName: locationName || '', batteryLevel, location, accuracy, positionValid, positionSource,
			satellites, speed, heading, source: 'gps', isSimulated: false, recordedAt,
		}
		// Reuse the unique _id index to make raw history idempotent across retries.
		// Raw evidence is durable before the live timestamp is allowed to advance.
		const sampleId = createHash('sha256').update(JSON.stringify([personnelId, assignment.assignmentId, +recordedAt])).digest('hex').slice(0, 24)
		const savedSample = await LocationHistory.findOneAndUpdate(
			{ _id: sampleId }, { $setOnInsert: sample }, { upsert: true, returnDocument: 'after' },
		)
		if (savedSample.location.coordinates[0] !== longitude || savedSample.location.coordinates[1] !== latitude
			|| ['accuracy', 'positionValid', 'positionSource', 'satellites'].some(field => (savedSample[field] ?? null) !== (sample[field] ?? null))) {
			throw createValidationError('This GPS timestamp already belongs to a different measurement.', 'recorded_at', 'GPS_FIX_CONFLICT')
		}
		const unsetFields = Object.fromEntries(['accuracy', 'positionValid', 'satellites', 'speed', 'heading', 'movementAnchorAccuracy']
			.filter(field => nextLocation[field] === undefined).map(field => [field, 1]))
		if (!sameDuty) {
			for (const field of ['geofenceStatus', 'geofenceBoundaryId', 'geofenceTransitionAt',
				'geofenceCandidateStatus', 'geofenceCandidateCount', 'geofenceCandidateRecordedAt', 'batteryAlertLevel', 'batteryAlertedAt']) {
				unsetFields[field] = 1
			}
		}
		let updated
		try {
			updated = await CurrentLocation.findOneAndUpdate(
				{ personnelId, $or: [{ recordedAt: { $lt: recordedAt } }, { recordedAt: { $exists: false } }, { source: { $ne: 'gps' } }] },
				{ $set: Object.fromEntries(Object.entries(nextLocation).filter(([, value]) => value !== undefined)),
					...(Object.keys(unsetFields).length && { $unset: unsetFields }) },
				{ upsert: true, returnDocument: 'after' },
			)
		} catch (error) {
			if (error.code !== 11000) throw error
			const winner = await CurrentLocation.findOne({ personnelId })
			if (!winner || winner.source !== 'gps' || +winner.recordedAt < +recordedAt) throw error
			return result(winner, false, 'stale_location', true)
		}
		if (dutyHistoryService) {
			try { await dutyHistoryService.saveCheckpoint(savedSample) } catch (error) {
				console.error('Hourly GPS checkpoint pending repair:', error.message)
			}
		}
		return result(updated, true, undefined, true)
	}

	// Both HTTP and Flespi pass through this queue, including jump confirmation.
	// The database condition also protects against another service writer.
	const ingestLocation = (payload = {}) => {
		const key = String(payload.imei || '').trim()
		const previous = queues.get(key) || Promise.resolve()
		const work = previous.catch(() => {}).then(() => ingest(payload))
		queues.set(key, work)
		return work.finally(() => { if (queues.get(key) === work) queues.delete(key) })
	}
	return { ingestLocation }
}

module.exports = createLocationIngestionService
