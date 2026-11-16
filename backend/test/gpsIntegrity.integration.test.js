// Opt in against a local MongoDB only. Each run owns a disposable, random database.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { before, after, beforeEach, describe, it } = require('node:test')
const mongoose = require('mongoose')
const models = require('../src/models')
const createIngestion = require('../src/services/personnel/locationIngestionService')
const { CurrentLocation, LocationHistory, Personnel, Deployment, GpsDeviceAssignment } = models

describe('GPS ingestion integrity in MongoDB', { skip: !process.env.GPS_HISTORY_TEST_URI }, () => {
	const databaseName = `codex_gps_integrity_test_${randomUUID().replaceAll('-', '')}`
	const now = new Date()
	const modelList = [CurrentLocation, LocationHistory, Personnel, Deployment, GpsDeviceAssignment]
	const makeService = (overrides = {}, clock = () => now) => createIngestion({
		models: { ...models, ...overrides }, clock,
		currentShiftFilter: () => ({ personnelId: 'P-1', status: 'active' }),
		serializePersonnel: (_profile, location) => location,
	})
	const payload = (seconds = 0, extra = {}) => ({ imei: '123456789012345', source: 'gps',
		latitude: 17.42 + seconds * 0.000001, longitude: 121.77,
		recorded_at: new Date(+now + seconds * 1000).toISOString(), accuracy: 4, satellites: 9, ...extra })
	before(async () => {
		assert.match(process.env.GPS_HISTORY_TEST_URI, /^mongodb:\/\/(127\.0\.0\.1|localhost):27017\/?$/)
		await mongoose.connect(process.env.GPS_HISTORY_TEST_URI, { dbName: databaseName, autoIndex: false, serverSelectionTimeoutMS: 2000 })
		for (const model of modelList) { await model.createCollection(); await model.createIndexes() }
	})
	after(async () => {
		if (mongoose.connection.name === databaseName && databaseName.startsWith('codex_gps_integrity_test_')) await mongoose.connection.dropDatabase()
		await mongoose.disconnect()
	})
	beforeEach(async () => {
		await Promise.all(modelList.map(model => model.deleteMany({})))
		await Personnel.create({ personnelId: 'P-1', badgeNumber: '1001', fullName: 'Officer One', rank: 'Patrolman' })
		await Deployment.create({ assignmentId: 'DEP-1', groupId: 'GROUP-1', personnelId: 'P-1', personnelName: 'Officer One', rank: 'Patrolman',
			patrolArea: 'Centro', shiftStart: new Date(+now - 3600_000), shiftEnd: new Date(+now + 3600_000), status: 'active' })
		await GpsDeviceAssignment.create({ assignmentId: 'GPS-1', personnelId: 'P-1', flespiDeviceId: '1', imei: '123456789012345', assignedAt: new Date(+now - 3600_000) })
	})
	it('does not advance live location when history fails, and retry saves exactly one raw fix', async () => {
		let fail = true
		const ingestion = makeService({ LocationHistory: {
			findOneAndUpdate: (...args) => { if (fail) { fail = false; throw Error('history unavailable') } return LocationHistory.findOneAndUpdate(...args) },
		} })
		await assert.rejects(ingestion.ingestLocation(payload()), /history unavailable/)
		assert.equal(await CurrentLocation.countDocuments(), 0)
		assert.equal((await ingestion.ingestLocation(payload())).accepted, true)
		assert.equal((await ingestion.ingestLocation(payload())).accepted, false)
		assert.equal(await LocationHistory.countDocuments(), 1)
		assert.equal(+(await CurrentLocation.findOne()).recordedAt, +now)
	})
	it('reuses durable history when the live write fails and a retry follows', async () => {
		let fail = true
		const ingestion = makeService({ CurrentLocation: {
			findOne: (...args) => CurrentLocation.findOne(...args),
			findOneAndUpdate: (...args) => { if (fail) { fail = false; throw Error('live unavailable') } return CurrentLocation.findOneAndUpdate(...args) },
		} })
		await assert.rejects(ingestion.ingestLocation(payload()), /live unavailable/)
		assert.equal(await LocationHistory.countDocuments(), 1)
		assert.equal(await CurrentLocation.countDocuments(), 0)
		assert.equal((await ingestion.ingestLocation(payload())).accepted, true)
		assert.equal(await LocationHistory.countDocuments(), 1)
	})
	it('prevents an older overlapping writer from overwriting a newer fix while retaining raw history', async () => {
		let entered, release
		const paused = new Promise(resolve => { entered = resolve })
		const resume = new Promise(resolve => { release = resolve })
		const slowWriter = makeService({ CurrentLocation: {
			findOne: (...args) => CurrentLocation.findOne(...args),
			findOneAndUpdate: async (...args) => { entered(); await resume; return CurrentLocation.findOneAndUpdate(...args) },
		} })
		const oldWrite = slowWriter.ingestLocation(payload(-20))
		await paused
		try { assert.equal((await makeService().ingestLocation(payload(-10))).accepted, true) }
		finally { release() }
		assert.equal((await oldWrite).reason, 'stale_location')
		assert.equal(+(await CurrentLocation.findOne()).recordedAt, +now - 10_000)
		assert.equal(await LocationHistory.countDocuments(), 2)
	})
	it('deduplicates concurrent identical fixes from separate ingestion instances', async () => {
		await Promise.all(Array.from({ length: 8 }, () => makeService().ingestLocation(payload())))
		assert.equal(await CurrentLocation.countDocuments(), 1)
		assert.equal(await LocationHistory.countDocuments(), 1)
	})
	it('does not replace durable measurement quality with different evidence during a retry', async () => {
		const ingestion = makeService({ CurrentLocation: {
			findOne: (...args) => CurrentLocation.findOne(...args),
			findOneAndUpdate: async () => { throw Error('live unavailable') },
		} })
		await assert.rejects(ingestion.ingestLocation(payload()), /live unavailable/)
		await assert.rejects(makeService().ingestLocation(payload(0, { accuracy: 1 })), { code: 'GPS_FIX_CONFLICT' })
		assert.equal(await CurrentLocation.countDocuments(), 0)
		assert.equal((await LocationHistory.findOne()).accuracy, 4)
		assert.equal((await makeService().ingestLocation(payload())).accepted, true)
	})
	it('detects cumulative slow walking and does not reset inactivity for stationary speed noise', async () => {
		let clockTime = new Date(+now - 350_000)
		const ingestion = makeService({}, () => clockTime)
		for (let step = 0; step <= 35; step++) {
			clockTime = new Date(+now - 350_000 + step * 10_000)
			assert.equal((await ingestion.ingestLocation(payload(0, { recorded_at: clockTime.toISOString(), latitude: 17.42 + step * 5 / 111195, speed: 1.8 }))).accepted, true)
		}
		const current = await CurrentLocation.findOne()
		assert.ok(+current.lastMovedAt >= +now - 50_000, '175 m of walking must reset inactivity despite each step being only 5 m')
		const before = +current.lastMovedAt
		clockTime = new Date(+now + 10_000)
		await ingestion.ingestLocation(payload(0, { recorded_at: clockTime.toISOString(), latitude: current.location.coordinates[1], speed: 3 }))
		assert.equal(+(await CurrentLocation.findOne()).lastMovedAt, before)
	})
	it('rejects missing timestamps, simulation and network positions without inserting real GPS evidence', async () => {
		const ingestion = makeService()
		for (const extra of [{ recorded_at: undefined }, { recorded_at: '' }, { source: 'mock' }, { isSimulated: true }]) {
			await assert.rejects(ingestion.ingestLocation(payload(0, extra)), { status: 400 })
		}
		assert.equal((await ingestion.ingestLocation(payload(0, { position_source: 'lbs' }))).accepted, false)
		assert.equal(await LocationHistory.countDocuments(), 0)
		assert.equal(await CurrentLocation.countDocuments(), 0)
	})
})
