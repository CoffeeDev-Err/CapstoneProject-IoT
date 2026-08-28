const {
	buildDateRange,
	buildPrefixSearchConditions,
	createPaginationMeta,
	parsePagination,
} = require('../../utils/query')
const { readCoordinates } = require('../../utils/geo')
const { getLocationFreshness } = require('../../utils/locationFreshness')
const { toMediaAccessPath } = require('../mediaStorageService')
const { getLocalLocationName } = require('../reverseGeocodingService')

const createPersonnelQueryService = ({ models, clock = () => new Date() }) => {
	const { CurrentLocation, Deployment, LocationHistory, Personnel } = models

const currentShiftFilter = (now = clock(), extra = {}) => ({
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
			|| clock()
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
	const now = clock()
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
		Deployment.findOne(currentShiftFilter(clock(), { personnelId })).select('_id').lean(),
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
		? await Deployment.distinct('personnelId', currentShiftFilter(clock()))
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
			: Deployment.distinct('personnelId', currentShiftFilter(clock(), {
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

	return {
		currentShiftFilter,
		emitPersonnelCollection,
		getLocationHistory,
		getPersonnelMember,
		getPersonnelWithLocations,
		listPersonnel,
		scopePersonnelForActor,
		serializePersonnel,
		updateDutyStatus,
	}
}

module.exports = createPersonnelQueryService
