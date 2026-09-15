const assert = require('node:assert/strict')
const { it } = require('node:test')
const createPersonnelLifecycleService = require('../src/services/personnel/lifecycleService')

const createFixture = () => {
	const shiftStart = new Date('2026-09-15T00:00:00.000Z')
	const deployment = {
		_id: 'deployment-1',
		assignmentId: 'DEP-001',
		personnelId: 'PNP-001',
		shiftStart,
	}
	const locations = []
	const notifications = []
	const models = {
		Deployment: {
			find: () => ({
				select: () => ({ lean: async () => [deployment] }),
			}),
			updateOne: async (filter, update) => {
				if (filter.gpsUnavailableAlertedAt && deployment.gpsUnavailableAlertedAt !== filter.gpsUnavailableAlertedAt) {
					return { modifiedCount: 0 }
				}
				if (filter.$or && deployment.gpsUnavailableAlertedAt) return { modifiedCount: 0 }
				Object.assign(deployment, update.$set || {})
				for (const key of Object.keys(update.$unset || {})) delete deployment[key]
				return { modifiedCount: 1 }
			},
		},
		CurrentLocation: {
			find: () => ({ lean: async () => locations }),
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
	return { deployment, locations, notifications, service, shiftStart }
}

it('alerts the officer and supervisor once after the missing-GPS grace period', async () => {
	const fixture = createFixture()
	const beforeGrace = new Date(fixture.shiftStart.getTime() + 119_000)
	const afterGrace = new Date(fixture.shiftStart.getTime() + 121_000)

	assert.deepEqual(await fixture.service.evaluatePersonnelGpsAvailability({ now: beforeGrace }), [])
	assert.equal(fixture.notifications.length, 0)

	const alerts = await fixture.service.evaluatePersonnelGpsAvailability({ now: afterGrace })
	assert.equal(alerts.length, 1)
	assert.equal(fixture.notifications.length, 2)
	assert.equal(fixture.notifications[0].recipientId, 'supervisor')
	assert.equal(fixture.notifications[1].recipientId, 'PNP-001')
	assert.match(fixture.notifications[1].message, /powered on, charged, connected to mobile data/)

	await fixture.service.evaluatePersonnelGpsAvailability({ now: new Date(afterGrace.getTime() + 15_000) })
	assert.equal(fixture.notifications.length, 2)
})

it('clears the outage marker after a fresh reading so a later outage can alert again', async () => {
	const fixture = createFixture()
	const firstAlertAt = new Date(fixture.shiftStart.getTime() + 121_000)
	await fixture.service.evaluatePersonnelGpsAvailability({ now: firstAlertAt })

	const freshReadingAt = new Date(firstAlertAt.getTime() + 1_000)
	fixture.locations.push({
		personnelId: 'PNP-001',
		location: { coordinates: [121.77, 17.42] },
		source: 'gps',
		recordedAt: freshReadingAt,
	})
	await fixture.service.evaluatePersonnelGpsAvailability({ now: freshReadingAt })
	assert.equal(fixture.deployment.gpsUnavailableAlertedAt, undefined)

	await fixture.service.evaluatePersonnelGpsAvailability({
		now: new Date(freshReadingAt.getTime() + 121_000),
	})
	assert.equal(fixture.notifications.length, 4)
})
