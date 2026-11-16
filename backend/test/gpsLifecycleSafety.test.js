const assert = require('node:assert/strict')
const { it } = require('node:test')
const createLifecycle = require('../src/services/personnel/lifecycleService')
const createQuery = require('../src/services/personnel/queryService')
const { CABAGAN_BOUNDARY_COORDS, isInsideCabagan, distanceToCabaganBoundary } = require('../src/utils/cabaganGeofence')
const now = new Date('2026-11-16T00:10:00Z')
const query = value => ({ select() { return this }, lean: async () => value, then: resolve => resolve(value) })
const fixture = (coordinates = [0, 0]) => {
	const location = { _id: 'L-1', personnelId: 'P-1', deviceAssignmentId: 'GPS-1', source: 'gps', isSimulated: false,
		recordedAt: now, location: { type: 'Point', coordinates }, accuracy: 10,
		lastMovedAt: new Date(+now - 360_000), geofenceStatus: 'inside' }
	const deployment = { _id: 'D-1', assignmentId: 'DEP-1', personnelId: 'P-1', shiftStart: new Date(+now - 600_000) }
	const emissions = [], notifications = []
	const io = { emit: () => { throw Error('Private personnel alert was broadcast globally') },
		to: room => ({ emit: (event, payload) => emissions.push({ room, event, payload }) }) }
	const models = {
		Deployment: { find: () => query([deployment]), updateOne: async (_filter, update) => { Object.assign(deployment, update.$set); return { modifiedCount: 1 } } },
		Personnel: { find: () => query([{ personnelId: 'P-1', fullName: 'Officer One' }]) },
		GpsDeviceAssignment: { find: () => query([{ personnelId: 'P-1', assignmentId: 'GPS-1' }]) },
		CurrentLocation: { find: () => query([location]), updateOne: async (_filter, update) => {
			Object.assign(location, update.$set)
			for (const field of Object.keys(update.$unset || {})) delete location[field]
			return { modifiedCount: 1 }
		} },
	}
	const service = createLifecycle({ models, currentShiftFilter: () => ({}), notificationService: { deliverNotification: async payload => { notifications.push(payload); return payload } } })
	return { service, location, deployment, io, emissions, notifications }
}

it('scopes geofence, GPS-unavailable and inactivity socket alerts to the supervisor and affected officer', async () => {
	for (const event of ['geofence', 'gps-unavailable', 'inactivity']) {
		const f = fixture()
		if (event === 'geofence') {
			await f.service.evaluatePersonnelGeofences({ io: f.io, now })
			f.location.recordedAt = new Date(+now + 10_000)
			await f.service.evaluatePersonnelGeofences({ io: f.io, now: f.location.recordedAt })
		} else if (event === 'gps-unavailable') {
			f.location.recordedAt = new Date(+now - 300_000)
			await f.service.evaluatePersonnelGpsAvailability({ io: f.io, now })
		} else await f.service.evaluatePersonnelInactivity({ io: f.io, now })
		assert.equal(f.emissions.length, 2)
		assert.deepEqual(f.emissions.map(item => item.room).sort(), ['personnel:P-1', 'role:supervisor'])
		assert.ok(f.emissions.every(item => item.event === (event === 'geofence' ? 'geofence:transition' : `personnel:${event}`)))
	}
})

it('does not alert on repeated readings just outside the boundary within the reported error radius', async () => {
	const [a, b] = CABAGAN_BOUNDARY_COORDS
	const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
	const outside = [[middle[0] + 0.000001, middle[1]], [middle[0] - 0.000001, middle[1]]]
		.find(([lat, lon]) => !isInsideCabagan(lat, lon))
	assert.ok(outside)
	assert.ok(distanceToCabaganBoundary(...outside) < 1)
	const f = fixture([outside[1], outside[0]])
	f.location.accuracy = 80
	for (const seconds of [0, 10, 20]) {
		f.location.recordedAt = new Date(+now + seconds * 1000)
		await f.service.evaluatePersonnelGeofences({ io: f.io, now: f.location.recordedAt })
	}
	assert.equal(f.emissions.length, 0)
	assert.equal(f.notifications.length, 0)
	assert.equal(f.location.geofenceStatus, 'inside')
	const serialized = createQuery({ models: {}, clock: () => f.location.recordedAt }).serializePersonnel(
		{ personnelId: 'P-1' }, f.location, { isOnDuty: true })
	assert.equal(serialized.boundaryStatus, 'uncertain')
	assert.equal(serialized.isInsideCabagan, null)
})

it('starts confirmation again after unknown accuracy or a gap, and never reports a pending exit as confirmed', async () => {
	const f = fixture()
	await f.service.evaluatePersonnelGeofences({ now })
	const serialize = createQuery({ models: {}, clock: () => f.location.recordedAt }).serializePersonnel
	assert.equal(serialize({ personnelId: 'P-1' }, f.location, { isOnDuty: true }).boundaryStatus, 'pending')
	f.location.recordedAt = new Date(+now + 10_000)
	f.location.accuracy = undefined
	await f.service.evaluatePersonnelGeofences({ now: f.location.recordedAt })
	assert.equal(f.location.geofenceCandidateCount, 0)
	f.location.accuracy = 5
	for (const seconds of [20, 60]) {
		f.location.recordedAt = new Date(+now + seconds * 1000)
		await f.service.evaluatePersonnelGeofences({ now: f.location.recordedAt })
		assert.equal(f.location.geofenceCandidateCount, 1)
		assert.equal(f.notifications.length, 0)
	}
	f.location.recordedAt = new Date(+now + 70_000)
	await f.service.evaluatePersonnelGeofences({ now: f.location.recordedAt })
	assert.equal(f.location.geofenceStatus, 'outside')
	assert.equal(serialize({ personnelId: 'P-1' }, f.location, { isOnDuty: true }).isInsideCabagan, false)
})

it('does not treat simulated locations as available GPS or expose them as map markers', async () => {
	const f = fixture([121.77, 17.42])
	f.location.source = 'mock'
	f.location.isSimulated = true
	await f.service.evaluatePersonnelGpsAvailability({ now, io: f.io })
	assert.equal(f.emissions.length, 2)
	const member = createQuery({ models: {}, clock: () => now }).serializePersonnel({ personnelId: 'P-1' }, f.location, { isOnDuty: true })
	assert.equal(member.isVisibleOnMap, false)
	assert.equal(member.latitude, null)
})
