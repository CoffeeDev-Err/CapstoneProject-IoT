const {
	CurrentLocation,
	Deployment,
	GpsDeviceAssignment,
	LocationHistory,
	Personnel,
} = require('../models')
const { distanceInMeters, point, readCoordinates } = require('../utils/geo')
const {
	buildDateRange,
	buildPrefixSearchConditions,
	createPaginationMeta,
	parsePagination,
} = require('../utils/query')
const {
	OPERATIONAL_LIMITS,
	createValidationError,
	validateOptionalNumber,
	validateText,
} = require('../utils/operationalValidation')
const { createNotification, deliverNotification } = require('./notificationService')
const { getLocalLocationName } = require('./reverseGeocodingService')
const { getLocationFreshness } = require('../utils/locationFreshness')
const { isInsideCabagan } = require('../utils/cabaganGeofence')
const { toMediaAccessPath } = require('./mediaStorageService')

const HISTORY_SAMPLE_INTERVAL_MS = 30_000
const MAX_MOCK_OFFSET = 0.002
const mockAnchors = new Map([
	['psms-002', [121.7683, 17.4213]],
])

const currentShiftFilter = (now = new Date(), extra = {}) => ({
	status: 'active',
	$and: [
		{ $or: [{ shiftStart: { $exists: false } }, { shiftStart: null }, { shiftStart: { $lte: now } }] },
		{ $or: [{ shiftEnd: { $exists: false } }, { shiftEnd: null }, { shiftEnd: { $gt: now } }] },
	],
	...extra,
})

const serializePersonnel = (profile, currentLocation, options = {}) => {
	const coordinates = currentLocation?.location?.coordinates
	const hasCoordinates = Array.isArray(coordinates)
		&& coordinates.length === 2
		&& coordinates.every(Number.isFinite)
	const isOnDuty = options.isOnDuty ?? profile.dutyStatus !== 'Off Duty'
	const freshness = getLocationFreshness({
		recordedAt: currentLocation?.recordedAt || currentLocation?.updatedAt,
		source: currentLocation?.source,
	})
	const hasCurrentLocation = hasCoordinates && !freshness.isLocationStale
	const localLocationName = hasCoordinates
		? getLocalLocationName(coordinates[1], coordinates[0])
		: null
	const lastKnownLocationName = localLocationName
		|| currentLocation?.locationName
		|| profile.defaultLocationName

	return {
		id: profile.personnelId,
		badge: profile.badgeNumber,
		name: profile.fullName,
		rank: profile.rank,
		locationName: hasCurrentLocation ? lastKnownLocationName : 'GPS location unavailable',
		lastKnownLocationName: hasCoordinates ? lastKnownLocationName : undefined,
		latitude: hasCoordinates ? coordinates[1] : null,
		longitude: hasCoordinates ? coordinates[0] : null,
		status: isOnDuty ? 'On Duty' : 'Off Duty',
		isOnDuty,
		isVisibleOnMap: isOnDuty && hasCurrentLocation,
		...(options.includePrivateDetails !== false && {
			mobileNumber: profile.mobileNumber,
		}),
		photoUrl: toMediaAccessPath(profile.photoUrl),
		lastUpdated: (
			currentLocation?.recordedAt
			|| currentLocation?.updatedAt
			|| profile.updatedAt
			|| new Date()
		).toISOString(),
		source: currentLocation?.source || 'mock',
		isSimulated: currentLocation?.isSimulated ?? true,
		isLocationStale: freshness.isLocationStale,
		locationStatus: !hasCoordinates
			? 'unavailable'
			: (freshness.isLocationStale ? 'stale' : 'current'),
		locationAgeSeconds: freshness.locationAgeSeconds,
		locationRecordedAt: freshness.locationRecordedAt?.toISOString(),
		speed: Number.isFinite(currentLocation?.speed) ? currentLocation.speed : null,
		batteryLevel: Number.isFinite(currentLocation?.batteryLevel)
			? currentLocation.batteryLevel
			: null,
		lastMovedAt: currentLocation?.lastMovedAt?.toISOString(),
		inactivityAlertedAt: currentLocation?.inactivityAlertedAt?.toISOString(),
	}
}

const getOfficerPersonnelId = (actor) => (
	actor?.role === 'officer' ? String(actor.personnelId || '').trim() : ''
)

const withoutPrivatePersonnelDetails = (member) => {
	const { mobileNumber: _mobileNumber, ...safeMember } = member
	return safeMember
}

const scopePersonnelForActor = (personnel = [], actor) => {
	if (!actor || actor.role === 'supervisor') return personnel
	const officerPersonnelId = getOfficerPersonnelId(actor)
	if (!officerPersonnelId) return []
	return personnel
		.filter((member) => member.id === officerPersonnelId || member.isOnDuty)
		.map(withoutPrivatePersonnelDetails)
}

const emitPersonnelCollection = (io, eventName, personnel = []) => {
	io.to('role:supervisor').emit(eventName, personnel)
	for (const member of personnel) {
		io.to(`personnel:${member.id}`).emit(
			eventName,
			scopePersonnelForActor(personnel, {
				role: 'officer',
				personnelId: member.id,
			}),
		)
	}
}

const getPersonnelWithLocations = async () => {
	const now = new Date()
	const [profiles, locations, onDutyPersonnelIds] = await Promise.all([
		Personnel.find({ status: 'active' }).sort({ fullName: 1 }).lean(),
		CurrentLocation.find().lean(),
		Deployment.distinct('personnelId', currentShiftFilter(now)),
	])
	const onDutySet = new Set(onDutyPersonnelIds)
	const locationsByPersonnel = new Map(
		locations.map((location) => [location.personnelId, location]),
	)

	return profiles.map((profile) => (
		serializePersonnel(profile, locationsByPersonnel.get(profile.personnelId), {
			isOnDuty: onDutySet.has(profile.personnelId),
		})
	))
}

const getPersonnelMember = async (personnelId, actor) => {
	const officerPersonnelId = getOfficerPersonnelId(actor)
	if (officerPersonnelId && officerPersonnelId !== personnelId) return null
	const [profile, location, deployment] = await Promise.all([
		Personnel.findOne({ personnelId, status: 'active' }).lean(),
		CurrentLocation.findOne({ personnelId }).lean(),
		Deployment.findOne(currentShiftFilter(new Date(), { personnelId })).select('_id').lean(),
	])

	return profile ? serializePersonnel(profile, location, {
		isOnDuty: Boolean(deployment),
		includePrivateDetails: !officerPersonnelId,
	}) : null
}

const listPersonnel = async (query = {}, actor) => {
	const pagination = parsePagination(query)
	const officerPersonnelId = getOfficerPersonnelId(actor)
	const visibleOnDutyPersonnelIds = officerPersonnelId
		? await Deployment.distinct('personnelId', currentShiftFilter(new Date()))
		: null
	const filter = !officerPersonnelId && query.include_inactive === 'true'
		? {}
		: { status: 'active' }
	if (officerPersonnelId) {
		filter.personnelId = {
			$in: [...new Set([...visibleOnDutyPersonnelIds, officerPersonnelId])],
		}
	}
	if (query.duty_status) filter.dutyStatus = String(query.duty_status)
	if (query.search) {
		filter.$and = buildPrefixSearchConditions(query.search, [
			'personnelId',
			'badgeNumber',
			'fullName',
			'rank',
		])
	}

	const [profiles, total] = await Promise.all([
		Personnel.find(filter)
			.sort({ fullName: 1, _id: 1 })
			.skip(pagination.skip)
			.limit(pagination.limit)
			.lean(),
		Personnel.countDocuments(filter),
	])
	const personnelIds = profiles.map((profile) => profile.personnelId)
	const [locations, queriedOnDutyPersonnelIds] = await Promise.all([
		CurrentLocation.find({ personnelId: { $in: personnelIds } }).lean(),
		visibleOnDutyPersonnelIds
			? Promise.resolve(visibleOnDutyPersonnelIds)
			: Deployment.distinct('personnelId', currentShiftFilter(new Date(), {
				personnelId: { $in: personnelIds },
			})),
	])
	const onDutySet = new Set(queriedOnDutyPersonnelIds)
	const locationByPersonnel = new Map(
		locations.map((location) => [location.personnelId, location]),
	)

	return {
		data: profiles.map((profile) => (
			serializePersonnel(profile, locationByPersonnel.get(profile.personnelId), {
				isOnDuty: onDutySet.has(profile.personnelId),
				includePrivateDetails: !officerPersonnelId,
			})
		)),
		pagination: createPaginationMeta({ ...pagination, total }),
	}
}

const updateDutyStatus = async (personnelId, dutyStatus) => {
	const normalizedStatus = String(dutyStatus || '').trim()
	if (!normalizedStatus) {
		const error = new Error('Duty status is required.')
		error.status = 400
		throw error
	}
	const profile = await Personnel.findOneAndUpdate(
		{ personnelId, status: 'active' },
		{ $set: { dutyStatus: normalizedStatus } },
		{ returnDocument: 'after' },
	)
	if (!profile) return null
	const location = await CurrentLocation.findOne({ personnelId }).lean()
	return serializePersonnel(profile, location)
}

const getLocationHistory = async (personnelId, query = {}) => {
	const pagination = parsePagination(query, { defaultLimit: 100, maxLimit: 500 })
	const filter = { personnelId }
	const recordedAt = buildDateRange(query.from, query.to)
	if (recordedAt) filter.recordedAt = recordedAt

	const [documents, total] = await Promise.all([
		LocationHistory.find(filter)
			.sort({ recordedAt: -1, _id: -1 })
			.skip(pagination.skip)
			.limit(pagination.limit)
			.lean(),
		LocationHistory.countDocuments(filter),
	])
	return {
		data: documents.map((location) => ({
			personnel_id: location.personnelId,
			...readCoordinates(location.location),
			accuracy: location.accuracy,
			speed: location.speed,
			heading: location.heading,
			source: location.source,
			is_simulated: location.isSimulated,
			recorded_at: location.recordedAt?.toISOString(),
		})),
		pagination: createPaginationMeta({ ...pagination, total }),
	}
}

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
		Deployment.findOne(currentShiftFilter(new Date(), { personnelId })).select('_id').lean(),
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

	const recordedAt = payload.recorded_at ? new Date(payload.recorded_at) : new Date()
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
			current.receivedAt = new Date()
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
		receivedAt: new Date(),
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

const evaluatePersonnelInactivity = async ({ io, now = new Date() } = {}) => {
	const inactivityMinutes = Math.max(2, Number(process.env.INACTIVITY_ALERT_MINUTES) || 5)
	const inactivityMs = inactivityMinutes * 60_000
	const deployments = await Deployment.find(currentShiftFilter(now))
		.select('assignmentId personnelId shiftStart')
		.lean()
	if (deployments.length === 0) return []

	const deploymentByPersonnel = new Map(
		deployments.map((deployment) => [deployment.personnelId, deployment]),
	)
	const personnelIds = [...deploymentByPersonnel.keys()]
	const [locations, profiles] = await Promise.all([
		CurrentLocation.find({ personnelId: { $in: personnelIds }, source: 'gps' }),
		Personnel.find({ personnelId: { $in: personnelIds }, status: 'active' })
			.select('personnelId fullName rank')
			.lean(),
	])
	const profilesById = new Map(profiles.map((profile) => [profile.personnelId, profile]))
	const alerts = []

	for (const location of locations) {
		if (getLocationFreshness({
			recordedAt: location.recordedAt || location.updatedAt,
			source: location.source,
			now,
		}).isLocationStale) continue

		const deployment = deploymentByPersonnel.get(location.personnelId)
		const movementAt = location.lastMovedAt || location.recordedAt || location.updatedAt
		const shiftStartedAt = deployment?.shiftStart || movementAt
		const monitoringStartedAt = new Date(Math.max(
			movementAt?.getTime?.() || now.getTime(),
			shiftStartedAt?.getTime?.() || now.getTime(),
		))
		if (now.getTime() - monitoringStartedAt.getTime() < inactivityMs) continue

		const result = await CurrentLocation.updateOne(
			{
				_id: location._id,
				$or: [
					{ inactivityAlertedAt: { $exists: false } },
					{ inactivityAlertedAt: null },
				],
			},
			{ $set: { inactivityAlertedAt: now } },
		)
		if (result.modifiedCount === 0) continue

		const profile = profilesById.get(location.personnelId)
		const officerName = profile?.fullName || location.personnelId
		const message = `${officerName} has no detected movement for ${inactivityMinutes} minutes during an active shift.`
		const [supervisorNotification] = await Promise.all([
			createNotification({
				recipientId: 'supervisor',
				type: 'warning',
				title: 'Personnel Inactivity',
				message,
				referenceType: 'personnel',
				referenceId: location.personnelId,
			}),
			deliverNotification({
				io,
				recipientId: location.personnelId,
				type: 'warning',
				title: 'Movement Check Required',
				message: `No movement has been detected for ${inactivityMinutes} minutes. Please confirm your status or move if safe to do so.`,
				referenceType: 'deployment',
				referenceId: deployment.assignmentId,
				priority: 'high',
				data: { destination: 'Map', assignmentId: deployment.assignmentId },
				dedupeKey: `personnel:${location.personnelId}:inactivity:${now.toISOString()}`,
			}),
		])
		const alert = {
			...supervisorNotification,
			personnelId: location.personnelId,
			personnelName: officerName,
			inactivityMinutes,
		}
		alerts.push(alert)
		io?.emit('personnel:inactivity', alert)
	}

	return alerts
}

const evaluatePersonnelGeofences = async ({ io, now = new Date() } = {}) => {
	const deployments = await Deployment.find(currentShiftFilter(now)).lean()
	if (deployments.length === 0) return []

	const personnelIds = [...new Set(deployments.map((item) => item.personnelId))]
	const [locations, assignments] = await Promise.all([
		CurrentLocation.find({ personnelId: { $in: personnelIds } }),
		GpsDeviceAssignment.find({ personnelId: { $in: personnelIds }, status: 'active' }).lean(),
	])
	const assignmentByPersonnel = new Map(
		assignments.map((assignment) => [assignment.personnelId, assignment]),
	)
	const transitions = []

	for (const location of locations) {
		const assignment = assignmentByPersonnel.get(location.personnelId)
		if (!assignment || location.deviceAssignmentId !== assignment.assignmentId) continue
		if (getLocationFreshness({
			recordedAt: location.recordedAt || location.updatedAt,
			source: location.source,
			now,
		}).isLocationStale) continue

		const [longitude, latitude] = location.location?.coordinates || []
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
		const nextStatus = isInsideCabagan(latitude, longitude) ? 'inside' : 'outside'
		const previousStatus = location.geofenceStatus
		if (previousStatus === nextStatus) continue

		const result = await CurrentLocation.updateOne(
			{
				_id: location._id,
				...(previousStatus
					? { geofenceStatus: previousStatus }
					: { $or: [{ geofenceStatus: { $exists: false } }, { geofenceStatus: null }] }),
			},
			{
				$set: {
					geofenceStatus: nextStatus,
					geofenceBoundaryId: 'cabagan-municipal',
					geofenceTransitionAt: now,
				},
			},
		)
		if (result.modifiedCount === 0) continue

		if (previousStatus !== 'outside' && nextStatus === 'inside') continue
		const isOutside = nextStatus === 'outside'
		const notification = await deliverNotification({
			io,
			recipientId: location.personnelId,
			type: isOutside ? 'geofence' : 'success',
			title: isOutside ? 'Boundary Warning' : 'Back Inside Boundary',
			message: isOutside
				? 'Your assigned GPS device has moved outside the allowed Cabagan boundary.'
				: 'Your assigned GPS device is back inside the allowed Cabagan boundary.',
			referenceType: 'geofence',
			referenceId: assignment.assignmentId,
			priority: isOutside ? 'critical' : 'low',
			data: { destination: 'Map', latitude, longitude, boundaryId: 'cabagan-municipal' },
			dedupeKey: `geofence:${assignment.assignmentId}:${nextStatus}:${now.toISOString()}`,
		})
		const transition = {
			...notification,
			personnelId: location.personnelId,
			status: nextStatus,
			latitude,
			longitude,
		}
		transitions.push(transition)
		io?.emit('geofence:transition', transition)
	}

	return transitions
}

const updateMockLocations = async ({ sampleHistory = false } = {}) => {
	const assignedPersonnelIds = await GpsDeviceAssignment.distinct(
		'personnelId',
		{ status: 'active' },
	)
	const locations = await CurrentLocation.find({
		source: 'mock',
		isSimulated: true,
		personnelId: { $nin: assignedPersonnelIds },
	})
	if (locations.length === 0) return getPersonnelWithLocations()

	const now = new Date()
	const history = []

	for (const current of locations) {
		const [longitude, latitude] = current.location.coordinates
		if (!mockAnchors.has(current.personnelId)) {
			mockAnchors.set(current.personnelId, [longitude, latitude])
		}
		const [anchorLongitude, anchorLatitude] = mockAnchors.get(current.personnelId)
		const nextLongitude = Math.max(
			anchorLongitude - MAX_MOCK_OFFSET,
			Math.min(
				anchorLongitude + MAX_MOCK_OFFSET,
				longitude + ((Math.random() - 0.5) * 0.0018),
			),
		)
		const nextLatitude = Math.max(
			anchorLatitude - MAX_MOCK_OFFSET,
			Math.min(
				anchorLatitude + MAX_MOCK_OFFSET,
				latitude + ((Math.random() - 0.5) * 0.0018),
			),
		)

		current.location.coordinates = [nextLongitude, nextLatitude]
		current.recordedAt = now
		current.receivedAt = now
		await current.save()

		if (sampleHistory) {
			history.push({
				personnelId: current.personnelId,
				deviceAssignmentId: current.deviceAssignmentId,
				location: {
					type: 'Point',
					coordinates: [nextLongitude, nextLatitude],
				},
				accuracy: current.accuracy,
				speed: current.speed,
				heading: current.heading,
				source: current.source,
				isSimulated: current.isSimulated,
				recordedAt: now,
			})
		}
	}

	if (history.length > 0) await LocationHistory.insertMany(history)
	return getPersonnelWithLocations()
}

module.exports = {
	emitPersonnelCollection,
	evaluatePersonnelGeofences,
	evaluatePersonnelInactivity,
	getPersonnelMember,
	getPersonnelWithLocations,
	getLocationHistory,
	ingestLocation,
	listPersonnel,
	scopePersonnelForActor,
	serializePersonnel,
	updateMockLocations,
	updateDutyStatus,
}
