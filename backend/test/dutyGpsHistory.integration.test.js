// Opt in with GPS_HISTORY_TEST_URI=mongodb://127.0.0.1:27017.
// Uses only its own randomly named temporary database; never the application DB.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { before, after, beforeEach, describe, it } = require('node:test')
const mongoose = require('mongoose')
const createHistory = require('../src/services/personnel/dutyGpsHistoryService')
const { snapshotDuty } = createHistory
const createIngestion = require('../src/services/personnel/locationIngestionService')
const ensureRetention = require('../src/config/gpsHistoryRetention')
const createDeploymentService = require('../src/services/operations/deploymentService')
const models = require('../src/models')
const { Personnel, Deployment, LocationHistory, DutyGpsHour, GpsDeviceAssignment, CurrentLocation } = models

describe('persistent duty GPS history (isolated local MongoDB)', { skip: !process.env.GPS_HISTORY_TEST_URI }, () => {
	const databaseName = `codex_gps_history_test_${randomUUID().replaceAll('-', '')}`
	const now = new Date()
	const end = new Date(now.getTime() - 60_000)
	const start = new Date(end.getTime() - 8 * 3600_000)
	const date = new Date(start.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
	const deployment = { assignmentId: 'DEP-HISTORY', groupId: 'GROUP-HISTORY', personnelId: 'P-001', personnelName: 'Officer One',
		rank: 'Patrolman', patrolArea: 'Barangay Centro', deploymentType: 'area', shiftStart: start, shiftEnd: end, status: 'completed' }
	const profile = { personnelId: 'P-001', badgeNumber: 'P-1001', fullName: 'Officer One', rank: 'Patrolman', dutyStatus: 'Off Duty' }
	const duty = snapshotDuty(deployment, profile)
	const sample = (offset, extra = {}) => ({ personnelId: 'P-001', deploymentId: deployment.assignmentId, duty,
		location: { type: 'Point', coordinates: [121.77, 17.42] }, source: 'gps', isSimulated: false, positionValid: true,
		accuracy: 4, satellites: 9, speed: 0, batteryLevel: 80, recordedAt: new Date(start.getTime() + offset), ...extra })
	const service = () => createHistory({ models, clock: () => now })
	before(async () => {
		assert.match(process.env.GPS_HISTORY_TEST_URI, /^mongodb:\/\/(127\.0\.0\.1|localhost):27017\/?$/)
		await mongoose.connect(process.env.GPS_HISTORY_TEST_URI, { dbName: databaseName, autoIndex: false, serverSelectionTimeoutMS: 2000 })
		for (const Model of [Personnel, Deployment, LocationHistory, DutyGpsHour, GpsDeviceAssignment, CurrentLocation]) {
			await Model.createCollection(); await Model.createIndexes()
		}
	})
	after(async () => {
		if (mongoose.connection.name === databaseName && databaseName.startsWith('codex_gps_history_test_')) await mongoose.connection.dropDatabase()
		await mongoose.disconnect()
	})
	beforeEach(async () => {
		await Promise.all([Personnel, Deployment, LocationHistory, DutyGpsHour, GpsDeviceAssignment, CurrentLocation].map(Model => Model.deleteMany({})))
		await Personnel.create(profile); await Deployment.create(deployment)
	})
	it('persists eight hourly checkpoints and detailed data across service restarts for all three styles', async () => {
		for (const deploymentType of ['area', 'point', 'route']) {
			await DutyGpsHour.deleteMany({}); await LocationHistory.deleteMany({})
			const entries = Array.from({ length: 8 }, (_, hour) => sample(hour * 3600_000 + 59 * 60_000, { duty: { ...duty, deploymentType } }))
			await LocationHistory.insertMany(entries)
			for (const entry of entries) await service().saveCheckpoint(entry)
			const result = await service().getHistory('P-001', { date, view: 'detailed' })
			assert.equal(result.hours.length, 8); assert.equal(result.points.length, 8)
			assert.equal(result.duty.deploymentType, deploymentType)
			assert.equal(result.hours.filter(hour => hour.checkpoint).length, 8)
			assert.equal(await DutyGpsHour.countDocuments({}), 8)
		}
	})
	it('repairs a missed hourly write from raw fixes and never manufactures stationary/offline readings', async () => {
		await LocationHistory.create(sample(120_000))
		const result = await service().getHistory('P-001', { date })
		assert.equal(result.hours.filter(hour => hour.checkpoint).length, 1)
		assert.equal(result.hours[0].checkpoint.recorded_at, sample(120_000).recordedAt.toISOString())
		assert.equal(result.hours[1].checkpoint, null)
		assert.equal(result.hours[1].status, 'no_reading')
		assert.equal(await DutyGpsHour.countDocuments({}), 1)
	})
	it('makes concurrent replay idempotent and retains the newest measurement in an hour', async () => {
		const earlier = sample(60_000), later = sample(600_000)
		for (let attempt = 0; attempt < 15; attempt++) {
			await DutyGpsHour.deleteMany({})
			await Promise.all([service().saveCheckpoint(later), service().saveCheckpoint(earlier), service().saveCheckpoint(later)])
			assert.equal(await DutyGpsHour.countDocuments({}), 1)
			assert.equal((await DutyGpsHour.findOne().lean()).checkpoint.recorded_at, later.recordedAt.toISOString())
		}
	})
	it('keeps archived duty details after deployment edits or deletion', async () => {
		await service().saveCheckpoint(sample(60_000))
		await Deployment.deleteMany({})
		const result = await service().getHistory('P-001', { date })
		assert.equal(result.duty.id, duty.id); assert.equal(result.hours.length, 8)
	})
	it('paginates every original fix and limits an hour without including another officer or duty', async () => {
		await LocationHistory.insertMany(Array.from({ length: 1005 }, (_, index) => sample(index * 1000)))
		await LocationHistory.create(sample(3_601_000, { personnelId: 'P-002' }))
		const first = await service().getHistory('P-001', { date, view: 'detailed', hour: '0' })
		assert.equal(first.points.length, 1000); assert.ok(first.next_cursor)
		const second = await service().getHistory('P-001', { date, view: 'detailed', hour: '0', cursor: first.next_cursor })
		assert.equal(second.points.length, 5); assert.equal(second.next_cursor, null)
		assert.ok(Date.parse(second.points[0].recorded_at) > Date.parse(first.points.at(-1).recorded_at))
		assert.equal((await service().getHistory('P-001', { date, view: 'detailed', hour: '1' })).points.length, 0)
	})
	it('excludes expired fixes, invalid/poor fixes and simulated samples even before MongoDB TTL cleanup', async () => {
		await LocationHistory.insertMany([sample(1000), sample(2000, { accuracy: 500 }), sample(3000, { satellites: 2 }),
			sample(4000, { positionValid: false }), sample(5000, { source: 'mock', isSimulated: true })])
		const result = await service().getHistory('P-001', { date, view: 'detailed' })
		assert.equal(result.points.length, 1)
		const futureService = createHistory({ models, clock: () => new Date(now.getTime() + 31 * 86400_000) })
		await assert.rejects(futureService.getHistory('P-001', { date }), /last 30 days/)
		for (const invalid of ['2026-02-30', '2026-99-01', 'bad']) await assert.rejects(service().getHistory('P-001', { date: invalid }), /valid history date/)
		await assert.rejects(service().getHistory('P-001', { date, deployment_id: 'someone-elses-duty' }), /this officer and date/)
	})
	it('migrates the real existing 24-hour TTL index without dropping unrelated indexes', async () => {
		await mongoose.connection.db.command({ collMod: 'location_history', index: { name: 'recordedAt_1', expireAfterSeconds: 86400 } })
		await ensureRetention(mongoose.connection.db)
		const indexes = await LocationHistory.collection.listIndexes().toArray()
		assert.equal(indexes.find(index => index.name === 'recordedAt_1').expireAfterSeconds, 2592000)
		assert.equal(indexes.length, 4)
	})
	it('archives only an accepted in-duty fix while preserving live updates and rejects a bad fix', async () => {
		await Deployment.updateOne({ assignmentId: duty.id }, { shiftStart: new Date(now.getTime() - 3600_000), shiftEnd: new Date(now.getTime() + 3600_000), status: 'active' })
		await GpsDeviceAssignment.create({ assignmentId: 'GPS-1', personnelId: profile.personnelId, flespiDeviceId: '1', imei: '123456789012345' })
		const ingestion = createIngestion({ models, clock: () => now, dutyHistoryService: service(),
			currentShiftFilter: () => ({ personnelId: profile.personnelId, status: 'active' }), serializePersonnel: (_profile, location) => ({ location }) })
		const payload = { imei: '123456789012345', latitude: 17.42, longitude: 121.77, recorded_at: now.toISOString(), satellites: 9, accuracy: 4, battery_level: 80 }
		assert.equal((await ingestion.ingestLocation(payload)).accepted, true)
		assert.equal(await DutyGpsHour.countDocuments({}), 1)
		assert.equal((await LocationHistory.findOne().lean()).duty.id, duty.id)
		assert.equal((await ingestion.ingestLocation({ ...payload, recorded_at: new Date(now.getTime() + 1000).toISOString(), position_valid: false })).accepted, false)
		assert.equal(await LocationHistory.countDocuments({}), 1)
	})
	it('requires a mode for new route deployments, persists it and preserves legacy modes in a batch save', async () => {
		await Deployment.deleteMany({})
		const deployments = createDeploymentService({ models, clock: () => now, io: { emit: () => {}, to: () => ({ emit: () => {} }) },
			loadPersonnelMap: async () => new Map([[profile.personnelId, profile]]),
			personnelService: { emitPersonnelCollection: () => {}, getPersonnelWithLocations: async () => [] },
			notificationService: { deliverNotification: async () => {} }, publish: { emitToSupervisorAndPersonnel: () => {} } })
		const input = { id: 'DEP-ROUTE', groupId: 'GROUP-ROUTE', personnelId: profile.personnelId, patrolAreaId: 'cabagan-santa-maria-road',
			deploymentType: 'route', status: 'active', shiftStart: new Date(now.getTime() - 60_000), shiftEnd: new Date(now.getTime() + 3600_000) }
		await assert.rejects(deployments.replaceDeployments([input]), /Choose Walk, Car, or Motorcycle/)
		assert.equal(await Deployment.countDocuments({}), 0)
		const saved = await deployments.replaceDeployments([{ ...input, patrolMode: 'motorcycle' }])
		assert.equal(saved[0].patrolMode, 'motorcycle')
		await deployments.replaceDeployments([input])
		assert.equal((await Deployment.findOne().lean()).patrolMode, 'motorcycle')
		await Deployment.updateOne({ assignmentId: input.id }, { $unset: { patrolMode: 1 } })
		await deployments.replaceDeployments([input])
		assert.equal((await Deployment.findOne().lean()).patrolMode, '')
	})
	it('never sends Walk or Motorcycle points to the car-only road matcher', async () => {
		let requests = 0
		const history = createHistory({ models, clock: () => now, roadMatcher: { match: async () => { requests++; return { status: 'matched', segments: [] } } } })
		for (const patrolMode of ['walk', 'motorcycle', 'car']) {
			await DutyGpsHour.deleteMany({}); await LocationHistory.deleteMany({})
			await LocationHistory.create(sample(60_000, { duty: { ...duty, deploymentType: 'route', patrolMode } }))
			const result = await history.getHistory('P-001', { date, view: 'detailed', hour: '0', road_match: 'true' })
			assert.equal(result.road_matching.status, patrolMode === 'car' ? 'matched' : 'unsupported_selection')
		}
		assert.equal(requests, 1)
	})
	it('applies the exact 30-day boundary inside a partially retained shift', async () => {
		// Put both boundary samples inside the real server's TTL lifetime so this
		// proves API exclusion, independently of MongoDB's background cleanup tick.
		const boundaryNow = new Date(now.getTime() + 60_000)
		const cutoff = boundaryNow.getTime() - 30 * 86400_000
		const retainedDuty = { ...duty, shiftStart: new Date(cutoff - 7200_000).toISOString(), shiftEnd: new Date(cutoff + 7200_000).toISOString() }
		await Deployment.deleteMany({})
		await LocationHistory.insertMany([sample(0, { duty: retainedDuty, recordedAt: new Date(cutoff - 1) }), sample(0, { duty: retainedDuty, recordedAt: new Date(cutoff + 1) })])
		const result = await createHistory({ models, clock: () => boundaryNow }).getHistory('P-001', { date: new Date(cutoff + 8 * 3600_000).toISOString().slice(0, 10), view: 'detailed' })
		assert.equal(result.points.length, 1)
		assert.equal(result.hours[0].status, 'expired')
		assert.equal(result.hours[1].status, 'expired')
		assert.equal(result.hours[2].checkpoint.recorded_at, new Date(cutoff + 1).toISOString())
	})
})
