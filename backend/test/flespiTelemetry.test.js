const assert = require('node:assert/strict')
const { it } = require('node:test')
const { fetchLatestTelemetry } = require('../src/services/flespiService')

const readFixture = async (t, telemetry) => {
	t.mock.method(globalThis, 'fetch', async () => ({
		ok: true,
		json: async () => ({ result: [{ id: 'device-1', telemetry }] }),
	}))
	const previousToken = process.env.FLESPI_TOKEN
	process.env.FLESPI_TOKEN = 'test-token'
	t.after(() => {
		if (previousToken === undefined) delete process.env.FLESPI_TOKEN
		else process.env.FLESPI_TOKEN = previousToken
	})
	return (await fetchLatestTelemetry({ deviceIds: ['device-1'] }))[0]
}

const fixture = (ts) => ({
	'position.latitude': { value: 17.42, ts },
	'position.longitude': { value: 121.77, ts },
	'timestamp': { value: ts, ts },
})

it('uses the GPS parameter timestamp rather than a newer heartbeat or battery message', async (t) => {
	const ts = 1791190635
	const row = await readFixture(t, {
		...fixture(ts),
		timestamp: { value: ts + 60, ts: ts + 60 },
		'server.timestamp': { value: ts + 65, ts: ts + 60 },
		'battery.level': { value: 35, ts: ts + 60 },
	})
	assert.equal(row.recordedAt, ts)
	assert.equal(row.batteryLevel, 35)
	assert.equal(row.receivedAt, ts + 65)
})

it('retains same-fix validity, satellites, accuracy and zero speed without inventing missing quality', async (t) => {
	const ts = 1791190635
	const row = await readFixture(t, {
		...fixture(ts),
		'position.valid': { value: false, ts },
		'position.satellites': { value: 2, ts },
		'position.accuracy': { value: 35, ts },
		'position.speed': { value: 0, ts },
		'position.direction': { value: null, ts },
	})
	assert.equal(row.positionValid, false)
	assert.equal(row.satellites, 2)
	assert.equal(row.accuracy, 35)
	assert.equal(row.speed, 0)
	assert.ok(Number.isNaN(row.heading))
	assert.ok(Number.isNaN(row.batteryLevel))
})

it('does not attach older speed or quality to a new position or reject it using old invalid status', async (t) => {
	const ts = 1791190635
	const row = await readFixture(t, {
		...fixture(ts),
		'position.valid': { value: false, ts: ts - 10 },
		'position.satellites': { value: 2, ts: ts - 10 },
		'position.accuracy': { value: 35, ts: ts - 10 },
		'position.speed': { value: 0, ts: ts - 10 },
	})
	assert.equal(row.recordedAt, ts)
	assert.equal(row.positionValid, undefined)
	assert.ok(Number.isNaN(row.speed))
	assert.ok(Number.isNaN(row.accuracy))
	assert.ok(Number.isNaN(row.satellites))
})

it('supports trackers without quality fields and timestamp-less legacy coordinate entries', async (t) => {
	const ts = 1791190635
	const row = await readFixture(t, {
		...fixture(ts),
		'position.latitude': { value: 17.42 },
		'position.longitude': { value: 121.77 },
	})
	assert.equal(row.recordedAt, ts)
	assert.equal(row.latitude, 17.42)
	assert.equal(row.positionValid, undefined)
	assert.ok(Number.isNaN(row.accuracy))
})

it('does not coerce a missing coordinate into a valid zero-degree position', async (t) => {
	const row = await readFixture(t, {
		...fixture(1791190635),
		'position.latitude': { value: null, ts: 1791190635 },
	})
	assert.ok(Number.isNaN(row.latitude))
})
