const assert = require('node:assert/strict')
const { it } = require('node:test')
const createLocationIngestionService = require('../src/services/personnel/locationIngestionService')

const setup = () => {
	const start = Date.now() - 60_000
	const history = []
	let current = null
	let writes = 0
	const service = createLocationIngestionService({
		clock: () => new Date(),
		currentShiftFilter: () => ({}),
		serializePersonnel: (_profile, location, options) => ({ location, ...options }),
		models: {
			GpsDeviceAssignment: { findOne: () => ({ lean: async () => ({
				assignmentId: 'GPS-001', personnelId: 'PNP-001', imei: '123456789012345',
			}) }) },
			Personnel: { findOne: () => ({ lean: async () => ({ personnelId: 'PNP-001' }) }) },
			Deployment: { findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'D-1' }) }) }) },
			CurrentLocation: {
				findOne: async () => current,
				findOneAndUpdate: async (_query, update) => {
					writes += 1
					current = { ...current, ...update.$set, save: async () => { writes += 1 } }
					for (const field of Object.keys(update.$unset || {})) {
						assert.ok(!(field in update.$set), 'must not set and unset the same field')
						delete current[field]
					}
					return current
				},
			},
			LocationHistory: {
				findOne: () => ({ sort: () => ({ select: () => ({ lean: async () => history.at(-1) }) }) }),
				create: async (entry) => { history.push(entry) },
			},
		},
	})
	const payload = (seconds, extra = {}) => ({
		imei: '123456789012345', latitude: 17.42 + seconds * 0.00001,
		longitude: 121.77, recorded_at: new Date(start + seconds * 1000).toISOString(),
		source: 'gps', ...extra,
	})
	return { service, payload, history, current: () => current, writes: () => writes }
}

it('records successive ten-second GPS fixes and preserves quality in history', async () => {
	const { service, payload, history } = setup()
	for (const seconds of [0, 10, 20, 30]) {
		const result = await service.ingestLocation(payload(seconds, {
			position_valid: true, satellites: 9, accuracy: 4, speed: 5,
		}))
		assert.equal(result.historySampled, true)
	}
	assert.equal(history.length, 4)
	assert.deepEqual(history.map((entry) => entry.positionValid), [true, true, true, true])
	assert.equal(history[3].satellites, 9)
	assert.equal(history[3].accuracy, 4)
})

it('keeps sub-ten-second updates live but never duplicates or reorders history', async () => {
	const { service, payload, history, current } = setup()
	await service.ingestLocation(payload(0))
	const subInterval = await service.ingestLocation(payload(5))
	assert.equal(subInterval.accepted, true)
	assert.equal(subInterval.historySampled, false)
	assert.equal(current().recordedAt.toISOString(), payload(5).recorded_at)
	assert.equal((await service.ingestLocation(payload(5))).reason, 'stale_location')
	assert.equal((await service.ingestLocation(payload(0))).accepted, false)
	assert.equal((await service.ingestLocation(payload(10))).historySampled, true)
	assert.equal(history.length, 2)
})

it('ignores explicitly invalid GPS fixes without overwriting the valid live position', async () => {
	const { service, payload, history, current, writes } = setup()
	await service.ingestLocation(payload(0, { position_valid: true }))
	const result = await service.ingestLocation(payload(10, { position_valid: false, satellites: 0 }))
	assert.equal(result.accepted, false)
	assert.equal(result.reason, 'invalid_gps_fix')
	assert.equal(current().recordedAt.toISOString(), payload(0).recorded_at)
	assert.equal(history.length, 1)
	assert.equal(writes(), 1)
})

it('accepts legacy fixes without quality and removes previous quality from a new live fix', async () => {
	const { service, payload, history, current } = setup()
	await service.ingestLocation(payload(0, { position_valid: true, satellites: 9, accuracy: 4, speed: 0 }))
	assert.equal((await service.ingestLocation(payload(10))).accepted, true)
	assert.equal(history[1].positionValid, undefined)
	assert.equal(history[1].accuracy, undefined)
	assert.equal(current().accuracy, undefined)
	assert.equal(current().positionValid, undefined)
	assert.equal(current().speed, undefined)
})

it('refreshes battery telemetry on the same fix without saving it as a new route point', async () => {
	const { service, payload, history, current } = setup()
	await service.ingestLocation(payload(0, { battery_level: 50 }))
	const result = await service.ingestLocation(payload(0, { battery_level: 45 }))
	assert.equal(result.reason, 'telemetry_refreshed')
	assert.equal(result.historySampled, false)
	assert.equal(history.length, 1)
	assert.equal(current().batteryLevel, 45)
	assert.equal(current().recordedAt.toISOString(), payload(0).recorded_at)
})

it('rejects stale or future readings, missing coordinates and malformed quality', async () => {
	const { service, payload, history, writes } = setup()
	for (const extra of [
		{ recorded_at: new Date(Date.now() - 3 * 60_000).toISOString() },
		{ recorded_at: new Date(Date.now() + 10 * 60_000).toISOString() },
		{ latitude: null },
		{ longitude: '' },
		{ position_valid: 'false' },
		{ satellites: 1.5 },
	]) {
		await assert.rejects(service.ingestLocation(payload(0, extra)), { status: 400 })
	}
	assert.equal(history.length, 0)
	assert.equal(writes(), 0)
})
