const assert = require('node:assert/strict')
const { it } = require('node:test')
const express = require('express')
const request = require('supertest')
const createHistory = require('../src/services/personnel/dutyGpsHistoryService')
const { buildHours, hourIndex, snapshotDuty, RETENTION_MS } = createHistory
const ensureRetention = require('../src/config/gpsHistoryRetention')
const createRoutes = require('../src/routes/personnelRoutes')
const createController = require('../src/controllers/personnelController')
const errorHandler = require('../src/middleware/errorHandler')

it('creates eight hourly periods across midnight and preserves actual GPS time without filling missing hours', () => {
	const duty = snapshotDuty({ assignmentId: 'D-1', shiftStart: '2026-11-04T14:00:00Z', shiftEnd: '2026-11-04T22:00:00Z' })
	const time = new Date('2026-11-04T14:04:00Z')
	const hours = buildHours(duty, [{ hour: 0, recordedAt: time, checkpoint: { recorded_at: time.toISOString() } }], Date.parse('2026-11-05T00:00:00Z'), 0)
	assert.equal(hours.length, 8)
	assert.equal(hours[0].checkpoint.recorded_at, time.toISOString())
	assert.equal(hours[1].status, 'no_reading')
	assert.equal(hours[1].checkpoint, null)
	assert.equal(hourIndex(duty, duty.shiftEnd), null)
	assert.equal(hourIndex(duty, '2026-11-04T15:00:00Z'), 1)
})
it('retries a conflicting first insert conditionally so a concurrently inserted older fix cannot win', async () => {
	const writes = []
	const history = createHistory({ models: { DutyGpsHour: { updateOne: async (...args) => {
		writes.push(args)
		if (writes.length === 1) { const error = new Error('Duplicate hour'); error.code = 11000; throw error }
	} } } })
	const recordedAt = new Date('2026-11-05T00:10:00Z')
	await history.saveCheckpoint({ personnelId: 'P-1', deploymentId: 'D-1', source: 'gps', recordedAt,
		duty: { shiftStart: '2026-11-05T00:00:00Z', shiftEnd: '2026-11-05T08:00:00Z' }, location: { coordinates: [121.77, 17.42] } })
	assert.equal(writes.length, 2)
	assert.deepEqual(writes[1][0].recordedAt, { $lt: recordedAt })
	assert.equal(writes[1][2], undefined, 'retry must not upsert another duplicate')
})
it('separates a partial last hour, future hours and expired checkpoints', () => {
	const duty = { shiftStart: '2026-11-05T00:00:00Z', shiftEnd: '2026-11-05T02:30:00Z' }
	const hours = buildHours(duty, [{ hour: 0, recordedAt: duty.shiftStart, checkpoint: {} }], Date.parse('2026-11-05T01:30:00Z'), Date.parse('2026-11-05T01:00:00Z'))
	assert.deepEqual(hours.map(hour => hour.status), ['expired', 'in_progress', 'upcoming'])
	assert.equal(hours[2].to, '2026-11-05T02:30:00.000Z')
	assert.equal(RETENTION_MS, 30 * 86400_000)
})
it('changes only the existing GPS TTL index and safely handles a fresh database', async () => {
	const commands = []
	const database = { collection: name => {
		assert.equal(name, 'location_history')
		return { listIndexes: () => ({ toArray: async () => [{ key: { recordedAt: 1 }, name: 'recordedAt_1', expireAfterSeconds: 86400 }] }) }
	}, command: async value => commands.push(value) }
	await ensureRetention(database)
	assert.deepEqual(commands, [{ collMod: 'location_history', index: { name: 'recordedAt_1', expireAfterSeconds: 2592000 } }])
	await ensureRetention({ collection: () => ({ listIndexes: () => ({ toArray: async () => { const error = new Error(); error.code = 26; throw error } }) }) })
})
it('recreates only the GPS TTL index when Atlas forbids collMod', async () => {
	const calls = []
	const collection = {
		listIndexes: () => ({ toArray: async () => [{ key: { recordedAt: 1 }, name: 'recordedAt_1', expireAfterSeconds: 86400 }] }),
		dropIndex: async name => calls.push(['dropIndex', name]),
		createIndex: async (key, options) => calls.push(['createIndex', key, options]),
	}
	const database = {
		collection: () => collection,
		command: async () => { const error = new Error('user is not allowed to do action [collMod]'); error.code = 8000; throw error },
	}
	await ensureRetention(database)
	assert.deepEqual(calls, [
		['dropIndex', 'recordedAt_1'],
		['createIndex', { recordedAt: 1 }, { name: 'recordedAt_1', expireAfterSeconds: 2592000 }],
	])
})
it('restricts officer duty GPS history to authenticated supervisors', async () => {
	let calls = 0
	const app = express()
	app.use('/api/personnel', createRoutes({ authService: { authenticate: async token => {
		if (!token) { const error = new Error('Authentication required.'); error.status = 401; throw error }
		return { user: { role: token === 'supervisor' ? 'supervisor' : 'officer', personnelId: 'P-1' } }
	} },
		controller: createController({ personnelService: { getDutyGpsHistory: async (id, query) => { calls++; return { id, date: query.date } } } }) }))
	app.use(errorHandler)
	await request(app).get('/api/personnel/P-2/gps-history').expect(401)
	await request(app).get('/api/personnel/P-2/gps-history').set('Authorization', 'Bearer officer').expect(403)
	const response = await request(app).get('/api/personnel/P-2/gps-history?date=2026-11-05').set('Authorization', 'Bearer supervisor').expect(200)
	assert.deepEqual(response.body, { id: 'P-2', date: '2026-11-05' })
	assert.equal(calls, 1)
})
