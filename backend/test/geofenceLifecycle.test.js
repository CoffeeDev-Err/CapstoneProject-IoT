const assert = require('node:assert/strict')
const { it } = require('node:test')
const createPersonnelLifecycleService = require('../src/services/personnel/lifecycleService')

const applyUpdate = (target, update) => {
	Object.assign(target, update.$set || {})
	for (const key of Object.keys(update.$unset || {})) delete target[key]
}

it('requires distinct accurate GPS readings and cools down rapid geofence reversals', async () => {
	const baseTime = new Date('2026-09-14T00:00:00.000Z')
	const location = {
		_id: 'location-1',
		personnelId: 'PNP-001',
		deviceAssignmentId: 'GPS-001',
		location: { type: 'Point', coordinates: [0, 0] },
		accuracy: 12,
		source: 'gps',
		isSimulated: false,
		recordedAt: baseTime,
		updatedAt: baseTime,
		geofenceStatus: 'inside',
	}
	const notifications = []
	const models = {
		Deployment: {
			find: () => ({ lean: async () => [{ assignmentId: 'DEP-001', personnelId: 'PNP-001' }] }),
		},
		GpsDeviceAssignment: {
			find: () => ({ lean: async () => [{ assignmentId: 'GPS-001', personnelId: 'PNP-001' }] }),
		},
		Personnel: { find: async () => [] },
		CurrentLocation: {
			find: async () => [location],
			updateOne: async (filter, update) => {
				if (
					filter.recordedAt
					&& filter.recordedAt.getTime() !== location.recordedAt.getTime()
				) return { modifiedCount: 0 }
				if (filter.geofenceStatus && filter.geofenceStatus !== location.geofenceStatus) {
					return { modifiedCount: 0 }
				}
				applyUpdate(location, update)
				return { modifiedCount: 1 }
			},
		},
	}
	const service = createPersonnelLifecycleService({
		models,
		currentShiftFilter: () => ({}),
		notificationService: {
			deliverNotification: async (payload) => {
				notifications.push(payload)
				return { id: `notification-${notifications.length}` }
			},
		},
	})

	let result = await service.evaluatePersonnelGeofences({
		now: new Date(baseTime.getTime() + 1_000),
	})
	assert.equal(result.length, 0)
	assert.equal(location.geofenceCandidateCount, 1)

	result = await service.evaluatePersonnelGeofences({
		now: new Date(baseTime.getTime() + 2_000),
	})
	assert.equal(result.length, 0)
	assert.equal(location.geofenceCandidateCount, 1)

	location.recordedAt = new Date(baseTime.getTime() + 10_000)
	location.updatedAt = location.recordedAt
	result = await service.evaluatePersonnelGeofences({
		now: new Date(baseTime.getTime() + 11_000),
	})
	assert.equal(result.length, 1)
	assert.equal(location.geofenceStatus, 'outside')
	assert.equal(notifications.length, 1)

	location.location.coordinates = [121.77, 17.42]
	location.recordedAt = new Date(baseTime.getTime() + 20_000)
	location.updatedAt = location.recordedAt
	await service.evaluatePersonnelGeofences({ now: new Date(baseTime.getTime() + 21_000) })
	location.recordedAt = new Date(baseTime.getTime() + 30_000)
	location.updatedAt = location.recordedAt
	result = await service.evaluatePersonnelGeofences({
		now: new Date(baseTime.getTime() + 31_000),
	})
	assert.equal(result.length, 1)
	assert.equal(location.geofenceStatus, 'inside')
	assert.equal(notifications.length, 1)
	assert.equal(result[0].alertSuppressed, true)

	location.location.coordinates = [0, 0]
	location.accuracy = 250
	location.recordedAt = new Date(baseTime.getTime() + 40_000)
	location.updatedAt = location.recordedAt
	await service.evaluatePersonnelGeofences({ now: new Date(baseTime.getTime() + 41_000) })
	assert.equal(location.geofenceStatus, 'inside')
	assert.equal(location.geofenceCandidateCount, 0)
})
