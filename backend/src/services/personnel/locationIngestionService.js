const { distanceInMeters, point } = require('../../utils/geo')
const {
	OPERATIONAL_LIMITS,
	createValidationError,
	validateOptionalNumber,
	validateText,
} = require('../../utils/operationalValidation')
const { getLocationFreshness } = require('../../utils/locationFreshness')

const HISTORY_SAMPLE_INTERVAL_MS = 30_000

const createLocationIngestionService = ({
	models,
	currentShiftFilter,
	serializePersonnel,
	clock = () => new Date(),
}) => {
	const {
		CurrentLocation,
		Deployment,
		GpsDeviceAssignment,
		LocationHistory,
		Personnel,
	} = models

const ingestLocation = async (payload = {}) => {
	const imei = String(payload.imei || '').trim()
	if (!/^\d{8,20}$/.test(imei)) {
		throw createValidationError(
			'An assigned 8-20 digit GPS IMEI is required.',
			'imei',
			'ASSIGNED_IMEI_REQUIRED',
		)
	}
	const assignment = await GpsDeviceAssignment.findOne({ imei, status: 'active' }).lean()
	if (!assignment) {
		throw createValidationError(
			'This GPS IMEI is not assigned to an active personnel account.',
			'imei',
			'GPS_ASSIGNMENT_NOT_FOUND',
		)
	}
	const personnelId = assignment.personnelId
	const requestedPersonnelId = String(payload.personnel_id || '').trim()
	if (requestedPersonnelId && requestedPersonnelId !== personnelId) {
		throw createValidationError(
			'The submitted personnel ID does not match the assigned GPS device.',
			'personnel_id',
			'GPS_PERSONNEL_MISMATCH',
		)
	}

	const [profile, activeDeployment] = await Promise.all([
		Personnel.findOne({ personnelId, status: 'active' }).lean(),
		Deployment.findOne(currentShiftFilter(clock(), { personnelId })).select('_id').lean(),
	])
	if (!profile) {
		const error = new Error('Active personnel profile not found.')
		error.status = 404
		throw error
	}

	const latitude = Number(payload.latitude)
	const longitude = Number(payload.longitude)
	if (
		!Number.isFinite(latitude)
		|| !Number.isFinite(longitude)
		|| latitude < -90
		|| latitude > 90
		|| longitude < -180
		|| longitude > 180
	) {
		const error = new Error('Valid latitude and longitude are required.')
		error.status = 400
		throw error
	}

	const recordedAt = payload.recorded_at ? new Date(payload.recorded_at) : clock()
	if (Number.isNaN(recordedAt.getTime())) {
		const error = new Error('recorded_at must be a valid date.')
		error.status = 400
		throw error
	}

	const source = payload.source === 'mock' ? 'mock' : 'gps'
	if (recordedAt > new Date(Date.now() + 5 * 60 * 1000)) {
		throw createValidationError(
			'recorded_at cannot be more than five minutes in the future.',
			'recorded_at',
		)
	}
	if (source === 'gps' && getLocationFreshness({ recordedAt, source }).isLocationStale) {
		throw createValidationError(
			'The GPS reading is too old to update the live location.',
			'recorded_at',
			'STALE_GPS_READING',
		)
	}
	const speed = validateOptionalNumber(payload.speed, {
		field: 'speed', label: 'Speed', min: 0, max: 300,
	})
	const heading = validateOptionalNumber(payload.heading, {
		field: 'heading', label: 'Heading', min: 0, max: 359.999,
	})
	const batteryLevel = validateOptionalNumber(payload.battery_level, {
		field: 'battery_level', label: 'Battery level', min: 0, max: 100,
	})
	const accuracy = validateOptionalNumber(payload.accuracy, {
		field: 'accuracy', label: 'GPS accuracy', min: 0.1, max: 5000,
	})
	const submittedLocationName = validateText(payload.location_name, {
		field: 'location_name',
		label: 'Location name',
		maxLength: OPERATIONAL_LIMITS.locationName,
		allowNewlines: false,
	})
	const current = await CurrentLocation.findOne({ personnelId })
	if (
		current?.recordedAt
		&& current.source === source
		&& recordedAt <= current.recordedAt
	) {
		const isSameReading = recordedAt.getTime() === current.recordedAt.getTime()
		const refreshedLocationName = submittedLocationName
		const telemetryChanged = isSameReading && (
			(speed !== undefined && speed !== current.speed)
			|| (heading !== undefined && heading !== current.heading)
			|| (batteryLevel !== undefined && batteryLevel !== current.batteryLevel)
		)
		if (
			source === 'gps'
			&& isSameReading
			&& (
				telemetryChanged
				|| (refreshedLocationName && refreshedLocationName !== current.locationName)
			)
		) {
			if (refreshedLocationName) current.locationName = refreshedLocationName
			if (speed !== undefined) current.speed = speed
			if (heading !== undefined) current.heading = heading
			if (batteryLevel !== undefined) current.batteryLevel = batteryLevel
			current.receivedAt = clock()
			await current.save()
			return {
				personnel: serializePersonnel(profile, current, {
					isOnDuty: Boolean(activeDeployment),
				}),
				accepted: true,
				reason: telemetryChanged ? 'telemetry_refreshed' : 'location_name_refreshed',
				historySampled: false,
			}
		}

		return {
			personnel: serializePersonnel(profile, current, {
				isOnDuty: Boolean(activeDeployment),
			}),
			accepted: false,
			reason: 'stale_location',
			historySampled: false,
		}
	}

	const movementThreshold = Math.max(5, Number(process.env.MOVEMENT_THRESHOLD_METERS) || 20)
	const hasMoved = !current
		|| current.source !== source
		|| distanceInMeters(current.location?.coordinates, [longitude, latitude]) >= movementThreshold
		|| (speed ?? 0) >= 2
	const nextLocation = {
		personnelId,
		deviceAssignmentId: assignment?.assignmentId,
		locationName: submittedLocationName || current?.locationName || profile.defaultLocationName,
		location: point(longitude, latitude),
		accuracy,
		speed,
		heading,
		batteryLevel,
		source,
		isSimulated: source === 'mock',
		recordedAt,
		receivedAt: clock(),
		lastMovedAt: hasMoved
			? recordedAt
			: (current?.lastMovedAt || current?.recordedAt || recordedAt),
		inactivityAlertedAt: hasMoved ? null : current?.inactivityAlertedAt,
	}
	const updated = await CurrentLocation.findOneAndUpdate(
		{ personnelId },
		{ $set: nextLocation },
		{ upsert: true, returnDocument: 'after' },
	)

	const latestHistory = await LocationHistory.findOne({ personnelId })
		.sort({ recordedAt: -1 })
		.select('recordedAt')
		.lean()
	const shouldSample = !latestHistory?.recordedAt
		|| recordedAt.getTime() - latestHistory.recordedAt.getTime() >= HISTORY_SAMPLE_INTERVAL_MS
	if (shouldSample) {
		await LocationHistory.create({
			personnelId,
			deviceAssignmentId: assignment?.assignmentId,
			location: nextLocation.location,
			accuracy: nextLocation.accuracy,
			speed: nextLocation.speed,
			heading: nextLocation.heading,
			source,
			isSimulated: source === 'mock',
			recordedAt,
		})
	}

	return {
		personnel: serializePersonnel(profile, updated, {
			isOnDuty: Boolean(activeDeployment),
		}),
		accepted: true,
		historySampled: shouldSample,
	}
}

	return { ingestLocation }
}

module.exports = createLocationIngestionService
module.exports.HISTORY_SAMPLE_INTERVAL_MS = HISTORY_SAMPLE_INTERVAL_MS
