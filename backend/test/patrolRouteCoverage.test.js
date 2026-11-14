const assert = require('node:assert/strict')
const { it } = require('node:test')
const { outsideCoverage, createPatrolCoverageService, hydratePatrolGeometry } = require('../src/services/patrolCoverageService')
const { normalizePatrolSchedule } = require('../src/services/patrolSchedule')

const geometry = { type: 'LineString', coordinates: [[121.76, 17.43], [121.77, 17.43], [121.77, 17.44]] }
const route = { label: 'Assigned route', coverageType: 'route', offsetMinutes: 0, durationMinutes: 120,
	geometry, roadDirections: true, routeCorridorMeters: 100 }

it('measures the full bent road and both endpoints, with GPS tolerance', () => {
	assert.equal(outsideCoverage(route, [121.77, 17.439], 10, 'car'), false)
	assert.equal(outsideCoverage(route, [121.765, 17.435], 10, 'car'), true)
	assert.equal(outsideCoverage(route, [121.765, 17.4311], 10, 'motorcycle'), false)
	assert.equal(outsideCoverage(route, [121.765, 17.432], 10, 'motorcycle'), true)
	assert.equal(outsideCoverage(route, [121.7594, 17.43], 10, 'car'), false)
	assert.equal(outsideCoverage(route, [121.756, 17.43], 10, 'car'), true)
	assert.equal(outsideCoverage({ ...route, routeCorridorMeters: 300 }, [121.765, 17.432], 10, 'car'), false)
})

it('supports a plotted foot path but never treats a vehicle waypoint guide as a road', () => {
	const manual = { ...route, roadDirections: false }
	assert.equal(outsideCoverage(manual, [121.765, 17.435], 10, 'walk'), true)
	assert.equal(outsideCoverage(manual, [121.765, 17.435], 10, 'car'), null)
	assert.equal(outsideCoverage(manual, [121.765, 17.435], 10, 'motorcycle'), null)
	assert.equal(outsideCoverage({ ...route, geometry: null }, [121.765, 17.435], 10, 'walk'), null)
})

it('defaults old routes to 100 meters and validates the adjustable route allowance', () => {
	const body = { deploymentType: 'route', patrolMode: 'walk', shiftStart: '2026-11-11T00:00:00Z', shiftEnd: '2026-11-11T02:00:00Z',
		scheduleBlocks: [{ label: 'Foot route', durationMinutes: 120, routePoints: [
			{ latitude: 17.4305, longitude: 121.765 }, { latitude: 17.431, longitude: 121.766 },
		] }] }
	assert.equal(normalizePatrolSchedule(body).scheduleBlocks[0].routeCorridorMeters, 100)
	for (const value of [0, 49, 1001, '100', Infinity]) assert.throws(() => normalizePatrolSchedule({ ...body,
		scheduleBlocks: [{ ...body.scheduleBlocks[0], routeCorridorMeters: value }],
	}), /route allowance/)
})

it('retries road directions when a previously saved vehicle route only had a waypoint guide', async (t) => {
	const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry, distance: 2000 }] }) }))
	const block = { ...route, roadDirections: false, routePoints: [{ latitude: 17.43, longitude: 121.76 }, { latitude: 17.431, longitude: 121.766 }] }
	const assignments = [{ id: 'DEP-1', patrolMode: 'car', scheduleBlocks: [{ ...block }] }]
	await hydratePatrolGeometry(assignments, new Map([['DEP-1', { patrolMode: 'car', scheduleBlocks: [block] }]]))
	assert.equal(fetch.mock.callCount(), 1)
	assert.equal(assignments[0].scheduleBlocks[0].roadDirections, true)
	assert.deepEqual(assignments[0].scheduleBlocks[0].geometry, geometry)
})

it('alerts both recipients during the active route block, suppresses stale repeats, and respects transfer time', async () => {
	const deployment = { _id: 'db-route', assignmentId: 'DEP-1', personnelId: 'PNP-1', personnelName: 'Officer',
		status: 'active', patrolMode: 'car', shiftStart: new Date('2026-11-11T00:00:00Z'), shiftEnd: new Date('2026-11-11T04:00:00Z'),
		transitionGraceMinutes: 10, scheduleBlocks: [route, { ...route, label: 'Next route', offsetMinutes: 120 }] }
	let location
	const notices = []
	const evaluate = createPatrolCoverageService({
		Deployment: { find: () => ({ lean: async () => [deployment] }), updateOne: async (_filter, update) => {
			Object.assign(deployment, update.$set); return { modifiedCount: 1 }
		} },
		CurrentLocation: { findOne: () => ({ lean: async () => location }) },
		deliverNotification: async notice => notices.push(notice),
	})
	const tick = async (time, patch = {}, coordinates = [121.765, 17.435]) => {
		location = { source: 'gps', recordedAt: new Date(time), accuracy: 10, satellites: 8, positionValid: true,
			location: { coordinates }, ...patch }
		await evaluate({ now: new Date(time) })
	}
	await tick('2026-11-11T00:01:00Z', { positionValid: false })
	await tick('2026-11-11T00:01:10Z', { accuracy: 200 })
	assert.equal(notices.length, 0)
	for (const second of ['20', '30', '40']) await tick(`2026-11-11T00:01:${second}Z`)
	assert.deepEqual(notices.map(n => n.recipientId).sort(), ['PNP-1', 'supervisor'])
	assert.match(notices[0].title, /patrol route/)
	await evaluate({ now: new Date('2026-11-11T00:20:00Z') })
	assert.equal(notices.length, 2)
	await tick('2026-11-11T02:05:00Z')
	assert.equal(notices.filter(n => n.type === 'geofence').length, 2)
	for (const second of ['00', '10', '20']) await tick(`2026-11-11T02:10:${second}Z`)
	assert.equal(notices.filter(n => n.type === 'geofence').length, 4)
	await tick('2026-11-11T04:01:00Z')
	assert.equal(notices.filter(n => n.type === 'geofence').length, 4)
})
