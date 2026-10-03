const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createOperationalRuntime = require('../src/runtime/operationalRuntime')

describe('operational runtime', () => {
	it('reconciles telemetry within ten seconds even when MQTT stays connected but silent', async () => {
		let now = 0
		let syncs = 0
		const calls = []
		const runtime = createOperationalRuntime({
			io: {}, isDatabaseReady: () => true, clock: () => now,
			operationalService: { reconcileTaskArrivals: async () => calls.push('arrivals') },
			personnelService: {
				emitPersonnelCollection: () => calls.push('broadcast'),
				getPersonnelWithLocations: async () => [],
			},
			flespiSyncService: { syncAssignedLocations: async () => { syncs += 1; return { accepted: 1 } } },
			createFlespiMqttService: () => ({ start: () => true, isConnected: () => true, stop: () => {} }),
			intervals: { gpsUpdate: 60_000, flespiSync: 3000, historySample: 30_000, deploymentStatus: 60_000 },
			flespiToken: 'test-token', logger: { log: () => {}, error: () => {} },
		})
		runtime.start()
		try {
			await runtime.runFlespiFallbackSync()
			assert.equal(syncs, 1)
			now = 3000
			await runtime.runFlespiFallbackSync()
			now = 6000
			await runtime.runFlespiFallbackSync()
			assert.equal(syncs, 1, 'Connected MQTT uses a bounded watchdog rather than fast offline polling')
			now = 9000
			await runtime.runFlespiFallbackSync()
			assert.equal(syncs, 2, 'A silent MQTT connection must not stop REST reconciliation')
			assert.deepEqual(calls, ['broadcast', 'arrivals', 'broadcast', 'arrivals'])
		} finally {
			runtime.stop()
		}
	})

	it('polls on every fallback tick while MQTT is disconnected', async () => {
		let syncs = 0
		const runtime = createOperationalRuntime({
			io: {}, isDatabaseReady: () => true,
			operationalService: {}, personnelService: {},
			flespiSyncService: { syncAssignedLocations: async () => { syncs += 1; return { accepted: 0 } } },
			intervals: { flespiSync: 3000 }, logger: { error: () => {} },
		})
		await runtime.runFlespiFallbackSync()
		await runtime.runFlespiFallbackSync()
		assert.equal(syncs, 2)
	})

	it('runs the lifecycle services in order behind a database readiness gate', async () => {
		const calls = []
		let ready = false
		const runtime = createOperationalRuntime({
			io: {},
			isDatabaseReady: () => ready,
			operationalService: {
				reconcileDeploymentShifts: async () => calls.push('deployments'),
				reconcileTaskArrivals: async () => calls.push('arrivals'),
				finalizeReportRouteSnapshots: async () => calls.push('reports'),
			},
			personnelService: {
				emitPersonnelCollection: () => {},
				evaluatePersonnelGpsAvailability: async () => calls.push('gps-availability'),
				evaluatePersonnelBattery: async () => calls.push('battery'),
				evaluatePersonnelInactivity: async () => calls.push('inactivity'),
				evaluatePersonnelGeofences: async () => calls.push('geofences'),
				getPersonnelWithLocations: async () => [],
				updateMockLocations: async () => [],
			},
			flespiSyncService: { syncAssignedLocations: async () => ({ accepted: 0 }) },
			createFlespiMqttService: () => ({ start: () => false }),
			intervals: { gpsUpdate: 1000, flespiSync: 1000, historySample: 1000, deploymentStatus: 1000 },
			flespiToken: '',
			logger: { log: () => {}, error: () => {} },
		})
		await runtime.runOperationalLifecycleCheck()
		assert.deepEqual(calls, [])
		ready = true
		await runtime.runOperationalLifecycleCheck()
		assert.deepEqual(calls, ['deployments', 'arrivals', 'gps-availability', 'battery', 'inactivity', 'geofences', 'reports'])
		runtime.stop()
	})
})
