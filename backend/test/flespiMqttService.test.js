const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { describe, it } = require('node:test')
const createFlespiMqttService = require('../src/services/flespiMqttService')

const createTimerHarness = () => {
	let nextId = 0
	const pending = new Map()

	return {
		clearTimer: (id) => pending.delete(id),
		getPending: () => [...pending.values()],
		runAll: async () => {
			const callbacks = [...pending.values()].map(({ callback }) => callback)
			pending.clear()
			await Promise.all(callbacks.map((callback) => callback()))
		},
		setTimer: (callback, delay) => {
			const id = ++nextId
			pending.set(id, { callback, delay })
			return id
		},
	}
}

const createFakeClient = () => {
	const client = new EventEmitter()
	client.end = (_force, done) => done()
	client.subscribe = (_topic, _options, done) => done()
	return client
}

const createServiceHarness = ({ debounceMs = '250' } = {}) => {
	const client = createFakeClient()
	const timers = createTimerHarness()
	const syncedDevices = []
	const service = createFlespiMqttService({
		onDeviceTelemetry: async (deviceId) => syncedDevices.push(deviceId),
		mqttConnect: () => client,
		environment: {
			FLESPI_MQTT_ENABLED: 'true',
			FLESPI_MQTT_DEBOUNCE_MS: debounceMs,
			FLESPI_TOKEN: 'test-token',
		},
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		clock: () => 1234,
		logger: { error: () => {}, log: () => {} },
	})
	assert.equal(service.start(), true)
	return { client, service, syncedDevices, timers }
}

const emitTelemetry = (client, deviceId, field = 'position') => {
	client.emit('message', `flespi/state/gw/devices/${deviceId}/telemetry/${field}`)
}

describe('Flespi MQTT debounce', () => {
	it('coalesces telemetry bursts independently for each device', async () => {
		const { client, service, syncedDevices, timers } = createServiceHarness()

		emitTelemetry(client, 'device-a', 'position')
		emitTelemetry(client, 'device-a', 'speed')
		emitTelemetry(client, 'device-b', 'position')

		assert.equal(timers.getPending().length, 2)
		assert.deepEqual(timers.getPending().map(({ delay }) => delay), [250, 250])

		await timers.runAll()
		assert.deepEqual(syncedDevices.sort(), ['device-a', 'device-b'])
		await service.stop()
	})

	it('enforces the minimum delay and cancels pending work when stopped', async () => {
		const { client, service, syncedDevices, timers } = createServiceHarness({ debounceMs: '25' })

		emitTelemetry(client, 'device-a')
		assert.equal(timers.getPending()[0].delay, 100)

		await service.stop()
		assert.equal(timers.getPending().length, 0)
		await timers.runAll()
		assert.deepEqual(syncedDevices, [])
	})
})
