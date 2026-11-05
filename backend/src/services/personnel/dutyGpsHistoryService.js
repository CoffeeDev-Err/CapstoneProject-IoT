const { createValidationError } = require('../../utils/operationalValidation')
const createRoadMatcher = require('../operations/reportRoadMatchingService')

const HOUR_MS = 3600_000
const RETENTION_MS = 30 * 24 * HOUR_MS
const PAGE_SIZE = 1000
const iso = value => new Date(value).toISOString()
const snapshotDuty = (deployment, profile = {}) => ({
	id: deployment.assignmentId,
	personnelId: deployment.personnelId,
	personnelName: profile.fullName || deployment.personnelName,
	badge: profile.badgeNumber || '',
	rank: profile.rank || deployment.rank,
	deploymentType: deployment.deploymentType || 'area',
	patrolMode: deployment.patrolMode || '',
	patrolArea: deployment.patrolArea || '',
	shiftStart: deployment.shiftStart && iso(deployment.shiftStart),
	shiftEnd: deployment.shiftEnd && iso(deployment.shiftEnd),
})
const serializePoint = point => ({
	latitude: point.location.coordinates[1], longitude: point.location.coordinates[0],
	recorded_at: iso(point.recordedAt), location_name: point.locationName || '',
	accuracy: point.accuracy ?? null, satellites: point.satellites ?? null,
	position_valid: point.positionValid ?? null, speed: point.speed ?? null,
	heading: point.heading ?? null, battery_level: point.batteryLevel ?? null,
	device_assignment_id: point.deviceAssignmentId || '',
})
const hourIndex = (duty, recordedAt) => {
	const start = Date.parse(duty?.shiftStart)
	const end = Date.parse(duty?.shiftEnd)
	const time = new Date(recordedAt).getTime()
	return Number.isFinite(start) && Number.isFinite(end) && end > start
		&& end - start <= 24 * HOUR_MS && time >= start && time < end
		? Math.floor((time - start) / HOUR_MS) : null
}
const buildHours = (duty, checkpoints, now, cutoff) => {
	const start = Date.parse(duty.shiftStart)
	const end = Date.parse(duty.shiftEnd)
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * HOUR_MS) return []
	const byHour = new Map(checkpoints.map(item => [item.hour, item]))
	return Array.from({ length: Math.ceil((end - start) / HOUR_MS) }, (_, hour) => {
		const from = start + hour * HOUR_MS
		const to = Math.min(end, from + HOUR_MS)
		const saved = byHour.get(hour)
		const checkpoint = saved && new Date(saved.recordedAt).getTime() >= cutoff ? saved.checkpoint : null
		return { hour, from: iso(from), to: iso(to), checkpoint,
			status: checkpoint ? 'recorded' : from > now ? 'upcoming' : to <= cutoff ? 'expired' : to > now ? 'in_progress' : 'no_reading' }
	})
}

const createDutyGpsHistoryService = ({ models, clock = () => new Date(), roadMatcher = createRoadMatcher() }) => {
	const { Deployment, DutyGpsHour, LocationHistory, Personnel } = models
	const saveCheckpoint = async (sample) => {
		const hour = hourIndex(sample.duty, sample.recordedAt)
		if (sample.source !== 'gps' || sample.isSimulated || hour === null || sample.positionValid === false
			|| (sample.accuracy != null && sample.accuracy > 100)
			|| (sample.satellites != null && sample.satellites < 4)) return
		const key = { personnelId: sample.personnelId, deploymentId: sample.deploymentId, hour }
		const values = { ...key, duty: sample.duty, checkpoint: serializePoint(sample), recordedAt: sample.recordedAt }
		try {
			await DutyGpsHour.updateOne({ ...key, $or: [
				{ recordedAt: { $lte: sample.recordedAt } }, { recordedAt: { $exists: false } },
			] }, { $set: values }, { upsert: true })
		} catch (error) {
			if (error.code !== 11000) throw error
			// Another writer inserted the hour between our match and upsert. It may
			// have inserted an OLDER fix. Retry an atomic conditional update without
			// upsert, so the newest fix wins in either order and never moves backwards.
			await DutyGpsHour.updateOne({ ...key, recordedAt: { $lt: sample.recordedAt } }, { $set: values })
		}
	}
	const getHistory = async (personnelId, query = {}) => {
		const profile = await Personnel.findOne({ personnelId }).lean()
		if (!profile) { const error = new Error('Personnel not found.'); error.status = 404; throw error }
		const now = clock().getTime()
		const cutoff = now - RETENTION_MS
		const date = query.date || new Date(now + 8 * HOUR_MS).toISOString().slice(0, 10)
		if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
			|| Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))
			|| new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
			throw createValidationError('Choose a valid history date.', 'date')
		}
		const from = new Date(`${date}T00:00:00+08:00`).getTime()
		const to = from + 24 * HOUR_MS
		if (to <= cutoff || from > now) throw createValidationError('History is available for the last 30 days.', 'date')
		const [deployments, archived, captured] = await Promise.all([
			Deployment.find({ personnelId, shiftStart: { $lt: new Date(to) }, shiftEnd: { $gt: new Date(Math.max(from, cutoff)) } }).lean(),
			DutyGpsHour.find({ personnelId, recordedAt: { $gte: new Date(cutoff) }, 'duty.shiftStart': { $lt: iso(to) }, 'duty.shiftEnd': { $gt: iso(from) } }).sort({ recordedAt: 1 }).lean(),
			// A raw fix also carries its duty snapshot. Recover even when a summary
			// write failed and the deployment was edited/deleted before history opened.
			LocationHistory.aggregate([
				{ $match: { personnelId, source: 'gps', isSimulated: { $ne: true }, deploymentId: { $exists: true },
					recordedAt: { $gte: new Date(Math.max(cutoff, from - 24 * HOUR_MS)), $lt: new Date(Math.min(now + 1, to + 24 * HOUR_MS)) },
					'duty.shiftStart': { $lt: iso(to) }, 'duty.shiftEnd': { $gt: iso(from) } } },
				{ $sort: { recordedAt: -1 } }, { $group: { _id: '$deploymentId', duty: { $first: '$duty' } } },
			]),
		])
		const duties = new Map(deployments.map(item => [item.assignmentId, snapshotDuty(item, profile)]))
		// Prefer the last captured duty details over subsequently edited/deleted deployments.
		archived.forEach(item => duties.set(item.deploymentId, item.duty))
		captured.forEach(item => duties.set(item._id, item.duty))
		const shifts = [...duties.values()].sort((a, b) => Date.parse(a.shiftStart) - Date.parse(b.shiftStart))
		const selectedId = query.deployment_id || shifts.at(-1)?.id
		const duty = shifts.find(item => item.id === selectedId)
		if (query.deployment_id && !duty) throw createValidationError('Select a duty from this officer and date.', 'deployment_id')
		const base = { personnel: { id: personnelId, name: profile.fullName, rank: profile.rank, badge: profile.badgeNumber }, date, shifts, duty: duty || null,
			retention_days: 30, hours: [], points: [], next_cursor: null, road_matching: null }
		if (!duty) return base
		const start = Math.max(Date.parse(duty.shiftStart), cutoff)
		const end = Math.min(Date.parse(duty.shiftEnd), now + 1)
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return base
		const filter = { personnelId, source: 'gps', isSimulated: { $ne: true }, positionValid: { $ne: false },
			accuracy: { $not: { $gt: 100 } }, satellites: { $not: { $lt: 4 } },
			recordedAt: { $gte: new Date(start), $lt: new Date(end) },
			$or: [{ deploymentId: duty.id }, { deploymentId: { $exists: false } }],
		}
		// Repair missing checkpoints from durable accepted fixes (also supports pre-upgrade data).
		// Aggregate only one sample per hour, independent of detailed-page pagination.
		const samples = query.cursor ? [] : await LocationHistory.aggregate([
			{ $match: filter }, { $sort: { recordedAt: 1 } },
			{ $group: { _id: { $floor: { $divide: [{ $subtract: ['$recordedAt', new Date(duty.shiftStart)] }, HOUR_MS] } }, sample: { $last: '$$ROOT' } } },
		])
		await Promise.all(samples.map(({ sample }) => saveCheckpoint({ ...sample, duty: sample.duty || duty, deploymentId: duty.id })))
		const checkpoints = await DutyGpsHour.find({ personnelId, deploymentId: duty.id, recordedAt: { $gte: new Date(cutoff) } }).lean()
		base.hours = buildHours(duty, checkpoints, now, cutoff)
		if (query.view !== 'detailed') return base
		let hour = null
		if (query.hour !== undefined && query.hour !== '') {
			hour = Number(query.hour)
			if (!Number.isInteger(hour) || hour < 0 || hour >= base.hours.length) throw createValidationError('Choose a valid duty hour.', 'hour')
			filter.recordedAt = { $gte: new Date(Math.max(start, Date.parse(base.hours[hour].from))), $lt: new Date(Math.min(end, Date.parse(base.hours[hour].to))) }
		}
		if (query.cursor) {
			const cursor = Number(query.cursor)
			if (!Number.isFinite(cursor) || cursor < start || cursor >= end) throw createValidationError('Invalid GPS history cursor.', 'cursor')
			filter.recordedAt.$gt = new Date(cursor)
		}
		const points = await LocationHistory.find(filter).sort({ recordedAt: 1 }).limit(PAGE_SIZE + 1).lean()
		base.points = points.slice(0, PAGE_SIZE).map(serializePoint)
		base.next_cursor = points.length > PAGE_SIZE ? String(new Date(points[PAGE_SIZE - 1].recordedAt).getTime()) : null
		if (query.road_match === 'true') {
			// Existing configured OSRM uses driving. Walk/motorcycle routes must not be
			// silently forced through car-only roads. Raw GPS traces work for all modes.
			base.road_matching = duty.patrolMode === 'car' && hour !== null && !base.next_cursor && !query.cursor
				? await roadMatcher.match(base.points)
				: { available: false, status: 'unsupported_selection', segments: [] }
		}
		return base
	}
	return { saveCheckpoint, getHistory }
}

module.exports = createDutyGpsHistoryService
module.exports.snapshotDuty = snapshotDuty
module.exports.hourIndex = hourIndex
module.exports.buildHours = buildHours
module.exports.RETENTION_MS = RETENTION_MS
