const assert = require('node:assert/strict')
const { it } = require('node:test')
const createPersonnelLifecycleService = require('../src/services/personnel/lifecycleService')

const applyUpdate = (target, update) => {
	Object.assign(target, update.$set || {})
	for (const key of Object.keys(update.$unset || {})) delete target[key]
}

const createFixture = () => {
	const now = new Date('2026-09-15T00:10:00.000Z')
	const deployment = {
		_id: 'deployment-1', assignmentId: 'DEP-001', personnelId: 'PNP-001',
	}
	const location = {
		_id: 'location-1', personnelId: 'PNP-001', source: 'gps', batteryLevel: 19,
		recordedAt: new Date(now.getTime() - 10_000), updatedAt: new Date(now.getTime() - 10_000),
		location: { type: 'Point', coordinates: [121.77, 17.42] },
	}
	const notifications = []
	const models = {
		Deployment: {
			find: () => ({ select: () => ({ lean: async () => [deployment] }) }),
		},
		CurrentLocation: {
			find: async () => [location],
			updateOne: async (filter, update) => {
				if (filter._id !== location._id) return { modifiedCount: 0 }
				if (filter.batteryAlertLevel && filter.batteryAlertLevel !== location.batteryAlertLevel) {
					return { modifiedCount: 0 }
				}
				if (filter.$or && location.batteryAlertLevel != null) return { modifiedCount: 0 }
				if (filter.batteryAlertedAt && filter.batteryAlertedAt !== location.batteryAlertedAt) {
					return { modifiedCount: 0 }
				}
				applyUpdate(location, update)
				return { modifiedCount: 1 }
			},
		},
		Personnel: {
			find: () => ({
				select: () => ({
					lean: async () => [{ personnelId: 'PNP-001', fullName: 'Officer One' }],
				}),
			}),
		},
		GpsDeviceAssignment: {},
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
	return { location, notifications, now, service }
}

it('alerts once at low and critical GPS battery levels, then resets after recovery', async () => {
	const fixture = createFixture()

	let alerts = await fixture.service.evaluatePersonnelBattery({ now: fixture.now })
	assert.equal(alerts.length, 1)
	assert.equal(fixture.notifications.length, 2)
	assert.equal(fixture.notifications[1].title, 'GPS Battery Low')
	assert.equal(fixture.notifications[1].data.alertClass, 'gps-safety')
	assert.equal(fixture.location.batteryAlertLevel, 'low')

	await fixture.service.evaluatePersonnelBattery({ now: new Date(fixture.now.getTime() + 10_000) })
	assert.equal(fixture.notifications.length, 2)

	fixture.location.batteryLevel = 9
	fixture.location.recordedAt = new Date(fixture.now.getTime() + 20_000)
	alerts = await fixture.service.evaluatePersonnelBattery({ now: fixture.location.recordedAt })
	assert.equal(alerts.length, 1)
	assert.equal(fixture.notifications.length, 4)
	assert.equal(fixture.notifications[3].title, 'GPS Battery Critical')
	assert.match(fixture.notifications[3].message, /9%/)
	assert.equal(fixture.location.batteryAlertLevel, 'critical')

	fixture.location.batteryLevel = 26
	fixture.location.recordedAt = new Date(fixture.now.getTime() + 30_000)
	await fixture.service.evaluatePersonnelBattery({ now: fixture.location.recordedAt })
	assert.equal(fixture.location.batteryAlertLevel, undefined)

	fixture.location.batteryLevel = 18
	fixture.location.recordedAt = new Date(fixture.now.getTime() + 40_000)
	await fixture.service.evaluatePersonnelBattery({ now: fixture.location.recordedAt })
	assert.equal(fixture.notifications.length, 6)
})

it('does not raise a battery warning from stale GPS telemetry', async () => {
	const fixture = createFixture()
	fixture.location.recordedAt = new Date(fixture.now.getTime() - 121_000)
	assert.deepEqual(await fixture.service.evaluatePersonnelBattery({ now: fixture.now }), [])
	assert.equal(fixture.notifications.length, 0)
})
