const {
	CurrentLocation,
	GpsDeviceAssignment,
	LocationHistory,
	Personnel,
} = require('../models')
const { point, readCoordinates } = require('../utils/geo')
const {
	buildDateRange,
	createPaginationMeta,
	escapeRegex,
	parsePagination,
} = require('../utils/query')

const DEFAULT_COORDINATES = [121.7681, 17.4239]
const HISTORY_SAMPLE_INTERVAL_MS = 30_000
const MAX_MOCK_OFFSET = 0.002
const mockAnchors = new Map([
	['pcpl-001', [121.7692, 17.4271]],
	['psms-002', [121.7683, 17.4213]],
	['pltc-003', [121.7748, 17.4189]],
])

const serializePersonnel = (profile, currentLocation) => {
	const coordinates = currentLocation?.location?.coordinates || DEFAULT_COORDINATES

	return {
		id: profile.personnelId,
		badge: profile.badgeNumber,
		name: profile.fullName,
		rank: profile.rank,
		locationName: currentLocation?.locationName || profile.defaultLocationName,
		latitude: coordinates[1],
		longitude: coordinates[0],
		status: profile.dutyStatus,
		mobileNumber: profile.mobileNumber,
		photoUrl: profile.photoUrl,
		lastUpdated: (
			currentLocation?.recordedAt
			|| currentLocation?.updatedAt
			|| profile.updatedAt
			|| new Date()
		).toISOString(),
		source: currentLocation?.source || 'mock',
		isSimulated: currentLocation?.isSimulated ?? true,
	}
}

const getPersonnelWithLocations = async () => {
	const [profiles, locations] = await Promise.all([
		Personnel.find({ status: 'active' }).sort({ fullName: 1 }).lean(),
		CurrentLocation.find().lean(),
	])
	const locationsByPersonnel = new Map(
		locations.map((location) => [location.personnelId, location]),
	)

	return profiles.map((profile) => (
		serializePersonnel(profile, locationsByPersonnel.get(profile.personnelId))
	))
}

const getPersonnelMember = async (personnelId) => {
	const [profile, location] = await Promise.all([
		Personnel.findOne({ personnelId, status: 'active' }).lean(),
		CurrentLocation.findOne({ personnelId }).lean(),
	])

	return profile ? serializePersonnel(profile, location) : null
}

const listPersonnel = async (query = {}) => {
	const pagination = parsePagination(query)
	const filter = query.include_inactive === 'true' ? {} : { status: 'active' }
	if (query.duty_status) filter.dutyStatus = String(query.duty_status)
	if (query.search) {
		const pattern = new RegExp(escapeRegex(query.search), 'i')
		filter.$or = [
			{ personnelId: pattern },
			{ badgeNumber: pattern },
			{ fullName: pattern },
			{ rank: pattern },
		]
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
	const locations = await CurrentLocation.find({
		personnelId: { $in: personnelIds },
	}).lean()
	const locationByPersonnel = new Map(
		locations.map((location) => [location.personnelId, location]),
	)

	return {
		data: profiles.map((profile) => (
			serializePersonnel(profile, locationByPersonnel.get(profile.personnelId))
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
	let personnelId = String(payload.personnel_id || '').trim()
	let assignment
	if (!personnelId && payload.imei) {
		assignment = await GpsDeviceAssignment.findOne({
			imei: String(payload.imei).trim(),
			status: 'active',
		}).lean()
		personnelId = assignment?.personnelId || ''
	}
	if (!personnelId) {
		const error = new Error('A valid personnel_id or assigned IMEI is required.')
		error.status = 400
		throw error
	}

	const profile = await Personnel.findOne({ personnelId, status: 'active' }).lean()
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

	const current = await CurrentLocation.findOne({ personnelId })
	if (current?.recordedAt && recordedAt < current.recordedAt) {
		return {
			personnel: serializePersonnel(profile, current),
			accepted: false,
			reason: 'stale_location',
			historySampled: false,
		}
	}

	if (!assignment) {
		assignment = await GpsDeviceAssignment.findOne({
			personnelId,
			status: 'active',
		}).lean()
	}
	const source = payload.source === 'mock' ? 'mock' : 'gps'
	const nextLocation = {
		personnelId,
		deviceAssignmentId: assignment?.assignmentId,
		locationName: String(payload.location_name || current?.locationName || profile.defaultLocationName),
		location: point(longitude, latitude),
		accuracy: Number.isFinite(Number(payload.accuracy)) ? Number(payload.accuracy) : undefined,
		speed: Number.isFinite(Number(payload.speed)) ? Number(payload.speed) : undefined,
		heading: Number.isFinite(Number(payload.heading)) ? Number(payload.heading) : undefined,
		source,
		isSimulated: source === 'mock',
		recordedAt,
		receivedAt: new Date(),
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
		personnel: serializePersonnel(profile, updated),
		accepted: true,
		historySampled: shouldSample,
	}
}

const updateMockLocations = async ({ sampleHistory = false } = {}) => {
	const locations = await CurrentLocation.find({ source: 'mock', isSimulated: true })
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
	getPersonnelMember,
	getPersonnelWithLocations,
	getLocationHistory,
	ingestLocation,
	listPersonnel,
	serializePersonnel,
	updateMockLocations,
	updateDutyStatus,
}
