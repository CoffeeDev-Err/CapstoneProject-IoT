const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createOperationalRuntime = require('../src/runtime/operationalRuntime')

describe('operational runtime', () => {
	it('runs the lifecycle services in order behind a database readiness gate', async () => {
		const calls = []
		let ready = false
		const runtime = createOperationalRuntime({
			io: {},
			isDatabaseReady: () => ready,
			operationalService: {
				reconcileDeploymentShifts: async () => calls.push('deployments'),
				finalizeReportRouteSnapshots: async () => calls.push('reports'),
			},
			personnelService: {
				emitPersonnelCollection: () => {},
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
		assert.deepEqual(calls, ['deployments', 'inactivity', 'geofences', 'reports'])
		runtime.stop()
	})
})
