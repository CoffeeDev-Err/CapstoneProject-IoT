const assert = require('node:assert/strict')
const { it } = require('node:test')
const createFlespiSyncService = require('../src/services/flespiSyncService')

it('does not request or store assigned tracker telemetry when no officer is on duty', async () => {
	let telemetryRequests = 0
	let ingested = 0
	const service = createFlespiSyncService({
		deploymentModel: { distinct: async () => [] },
		flespiService: {
			fetchLatestTelemetry: async () => { telemetryRequests += 1; return [] },
		},
		personnelService: {
			ingestLocation: async () => { ingested += 1 },
		},
	})

	assert.deepEqual(await service.syncAssignedLocations(), {
		assignments: 0, accepted: 0, skipped: 0,
	})
	assert.equal(telemetryRequests, 0)
	assert.equal(ingested, 0)
})

it('requests and stores telemetry only for an officer with an active deployment', async () => {
	const recordedAt = new Date()
	const assignmentQueries = []
	const ingested = []
	const service = createFlespiSyncService({
		clock: () => recordedAt,
		resolveLocation: async () => 'Centro, Cabagan',
		deploymentModel: { distinct: async () => ['PNP-001'] },
		assignmentModel: {
			find: (query) => {
				assignmentQueries.push(query)
				return { lean: async () => [{
					assignmentId: 'GPS-001', personnelId: 'PNP-001',
					flespiDeviceId: 'device-1', imei: '123456789012345',
				}] }
			},
		},
		flespiService: {
			fetchLatestTelemetry: async () => [{
				deviceId: 'device-1', latitude: 17.42, longitude: 121.77,
				batteryLevel: 19, recordedAt: recordedAt.getTime(),
				positionValid: true, satellites: 9, accuracy: 4,
			}],
		},
		personnelService: {
			ingestLocation: async (payload) => {
				ingested.push(payload)
				return { accepted: true }
			},
		},
	})

	assert.deepEqual(await service.syncAssignedLocations(), {
		assignments: 1, accepted: 1, skipped: 0,
	})
	assert.deepEqual(assignmentQueries[0].personnelId, { $in: ['PNP-001'] })
	assert.equal(ingested[0].battery_level, 19)
	assert.equal(ingested[0].position_valid, true)
	assert.equal(ingested[0].satellites, 9)
	assert.equal(ingested[0].accuracy, 4)
})

it('skips invalid or stale fixes before geocoding or live ingestion', async () => {
	let geocoded = 0
	let ingested = 0
	const service = createFlespiSyncService({
		deploymentModel: { distinct: async () => ['PNP-001', 'PNP-002'] },
		assignmentModel: { find: () => ({ lean: async () => [
			{ personnelId: 'PNP-001', flespiDeviceId: 'device-1', imei: '123456789012345' },
			{ personnelId: 'PNP-002', flespiDeviceId: 'device-2', imei: '123456789012346' },
		] }) },
		flespiService: { fetchLatestTelemetry: async () => [
			{ deviceId: 'device-1', latitude: 17.42, longitude: 121.77,
				positionValid: false, recordedAt: Date.now() },
			{ deviceId: 'device-2', latitude: 17.42, longitude: 121.77,
				recordedAt: Date.now() - 3 * 60_000 },
		] },
		resolveLocation: async () => { geocoded += 1 },
		personnelService: { ingestLocation: async () => { ingested += 1 } },
	})
	assert.deepEqual(await service.syncAssignedLocations(), { assignments: 2, accepted: 0, skipped: 2 })
	assert.equal(geocoded, 0)
	assert.equal(ingested, 0)
})

it('ingests a fresh fix without waiting for a slow place-name lookup', async () => {
	const recordedAt = new Date()
	let finishLookup
	const pendingLookup = new Promise((resolve) => { finishLookup = resolve })
	const ingested = []
	const service = createFlespiSyncService({
		locationNameBudgetMs: 1,
		resolveLocation: () => pendingLookup,
		deploymentModel: { distinct: async () => ['PNP-001'] },
		assignmentModel: { find: () => ({ lean: async () => [{
			personnelId: 'PNP-001', flespiDeviceId: 'device-1', imei: '123456789012345',
		}] }) },
		flespiService: { fetchLatestTelemetry: async () => [{
			deviceId: 'device-1', latitude: 17.42, longitude: 121.77, recordedAt: recordedAt.getTime(),
		}] },
		personnelService: { ingestLocation: async (payload) => {
			ingested.push(payload)
			return { accepted: true }
		} },
	})
	const result = await service.syncAssignedLocations()
	assert.equal(result.accepted, 1)
	assert.equal(ingested[0].recorded_at, recordedAt.toISOString())
	assert.equal(ingested[0].location_name, 'GPS 17.42000, 121.77000')
	finishLookup('Centro, Cabagan')
	await pendingLookup
	// The cached name can refresh later without delaying the original coordinates.
	await service.syncAssignedLocations()
	assert.equal(ingested[1].location_name, 'Centro, Cabagan')
})
