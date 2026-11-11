const assert = require('node:assert/strict')
const { it } = require('node:test')
const { normalizePatrolSchedule, currentPatrolBlock, deploymentContextAt } = require('../src/services/patrolSchedule')
const { outsideCoverage, createPatrolCoverageService } = require('../src/services/patrolCoverageService')
const { normalizeFleetWeek, weekFor, validateVehicleDeployments } = require('../src/services/fleetService')
const start = '2026-11-09T00:00:00Z', end = '2026-11-09T04:00:00Z'
const mall = { label: 'Mall', durationMinutes: 120, coverageType: 'custom', latitude: 17.4305, longitude: 121.765, radiusMeters: 200 }
const park = { ...mall, label: 'Park', latitude: 17.431 }
const duty = { deploymentType: 'area', shiftStart: start, shiftEnd: end, status: 'active', scheduleBlocks: [mall, park] }

it('keeps two-hour areas under one duty and switches at the exact boundary', () => {
	const normalized = { ...duty, ...normalizePatrolSchedule(duty) }
	assert.equal(normalized.scheduleBlocks[1].offsetMinutes, 120)
	assert.equal(currentPatrolBlock(normalized, new Date('2026-11-09T01:59:59Z')).block.label, 'Mall')
	assert.equal(currentPatrolBlock(normalized, new Date('2026-11-09T02:00:00Z')).block.label, 'Park')
	assert.equal(currentPatrolBlock(normalized, new Date(end)), null)
	assert.equal(currentPatrolBlock(normalized, new Date('2026-11-08T23:59:59Z')), null)
})
it('rejects uncovered duty time, invalid points and tampered duration offsets', () => {
	assert.throws(() => normalizePatrolSchedule({ ...duty, scheduleBlocks: [mall] }), /fill the duty exactly/)
	assert.throws(() => normalizePatrolSchedule({ ...duty, scheduleBlocks: [{ ...mall, latitude: 0 }, park] }), /inside Cabagan/)
	assert.equal(normalizePatrolSchedule({ ...duty, scheduleBlocks: [{ ...mall, offsetMinutes: 50 }, park] }).scheduleBlocks[0].offsetMinutes, 0)
})
it('allows foot routes inside a market without the old highway-only prerequisite', () => {
	const route = { label: 'Market walk', durationMinutes: 240, routePoints: [mall, park] }
	assert.equal(normalizePatrolSchedule({ ...duty, deploymentType: 'route', patrolMode: 'walk', scheduleBlocks: [route] }).scheduleBlocks[0].coverageType, 'route')
	assert.throws(() => normalizePatrolSchedule({ ...duty, deploymentType: 'route', patrolMode: 'car', scheduleBlocks: [route] }), /vehicle/)
})
it('computes Monday through Sunday in Philippine time and disallows shared crew', () => {
	assert.equal(weekFor('2026-11-08T15:59:59Z'), '2026-11-02')
	assert.equal(weekFor('2026-11-08T16:00:00Z'), '2026-11-09')
	const crew = { vehicleId: 'car-1', driverId: 'PNP-1', personnelIds: ['PNP-1', 'PNP-2'] }
	assert.equal(normalizeFleetWeek({ weekStart: '2026-11-09', crews: [crew] }).weekEnd.toISOString(), '2026-11-15T16:00:00.000Z')
	assert.throws(() => normalizeFleetWeek({ weekStart: '2026-11-10', crews: [crew] }), /Monday/)
	assert.throws(() => normalizeFleetWeek({ weekStart: '2026-11-09', crews: [crew, { ...crew, vehicleId: 'car-2' }] }), /only one vehicle/)
	assert.throws(() => normalizeFleetWeek({ weekStart: '2026-11-09', crews: [{ ...crew, driverId: 'PNP-3' }] }), /driver/)
})
it('locks the whole weekly vehicle crew and prevents a deployment spanning the next week', async () => {
	const FleetWeek = { find: () => ({ lean: async () => [{ weekStart: '2026-11-09', weekEnd: new Date('2026-11-15T16:00:00Z'), crews: [{ vehicleId: 'car-1', personnelIds: ['PNP-1', 'PNP-2'], driverId: 'PNP-1' }] }] }) }
	const assignments = ['PNP-1', 'PNP-2'].map(personnelId => ({ ...duty, groupId: 'GRP-1', personnelId, patrolMode: 'car', vehicleId: 'car-1' }))
	await validateVehicleDeployments(assignments, FleetWeek)
	assert.equal(assignments[0].vehicleCrew.driverId, 'PNP-1')
	await assert.rejects(validateVehicleDeployments(assignments.slice(0, 1), FleetWeek), /complete assigned/)
	await assert.rejects(validateVehicleDeployments(assignments.map(a => ({ ...a, shiftEnd: '2026-11-16T00:00:00Z' })), FleetWeek), /full duty/)
})
it('does not flag locations inside accuracy tolerance or invent a missing barangay boundary', () => {
	assert.equal(outsideCoverage(mall, [121.765, 17.4305], 10), false)
	assert.equal(outsideCoverage(mall, [121.765, 17.434], 10), true)
	assert.equal(outsideCoverage({ coverageType: 'barangay' }, [121.765, 17.434]), null)
})
it('records the area at incident time after the full duty has ended', () => {
	const completed = { ...duty, ...normalizePatrolSchedule(duty), status: 'completed' }
	assert.equal(deploymentContextAt(completed, new Date('2026-11-09T00:30:00Z')).patrolArea, 'Mall')
	assert.equal(deploymentContextAt(completed, new Date('2026-11-09T02:30:00Z')).patrolArea, 'Park')
	assert.equal(currentPatrolBlock(completed, new Date('2026-11-09T02:30:00Z')), null)
})
it('uses each barangay reference center without inventing boundary geometry', () => {
	const result = normalizePatrolSchedule({ ...duty, scheduleBlocks: [
		{ label: 'Cubag', coverageType: 'barangay', barangay: 'Cubag', durationMinutes: 240 },
	] }).scheduleBlocks[0]
	assert.equal(result.latitude, 17.4201)
	assert.equal(result.longitude, 121.7887)
	assert.equal(result.geometry, undefined)
})
it('delays outside warnings during transfer allowance and still sends the transition reminder', async () => {
	const deployment = { ...duty, ...normalizePatrolSchedule(duty), assignmentId: 'DEP-1', personnelId: 'PNP-1', shiftStart: new Date(start), shiftEnd: new Date(end) }
	let gpsQueries = 0
	const notifications = []
	const check = createPatrolCoverageService({
		Deployment: { find: () => ({ lean: async () => [deployment] }) },
		CurrentLocation: { findOne: () => { gpsQueries++; return { lean: async () => null } } },
		deliverNotification: async item => notifications.push(item),
	})
	await check({ now: new Date('2026-11-09T02:05:00Z') })
	assert.equal(gpsQueries, 0)
	assert.equal(notifications[0].title, 'Move to your next patrol area')
	await check({ now: new Date('2026-11-09T02:10:00Z') })
	assert.equal(gpsQueries, 1)
})
it('requires three distinct fresh GPS fixes and notifies the officer and supervisor once', async () => {
	const deployment = { ...duty, ...normalizePatrolSchedule(duty), _id: 'db-1', assignmentId: 'DEP-1', personnelId: 'PNP-1', personnelName: 'Officer', shiftStart: new Date(start), shiftEnd: new Date(end) }
	let location = { source: 'gps', isSimulated: false, recordedAt: new Date('2026-11-09T00:01:00Z'), accuracy: 10, location: { coordinates: [121.765, 17.434] } }
	const notifications = []
	const check = createPatrolCoverageService({
		Deployment: { find: () => ({ lean: async () => [deployment] }), updateOne: async (_query, update) => { Object.assign(deployment, update.$set); return { modifiedCount: 1 } } },
		CurrentLocation: { findOne: () => ({ lean: async () => location }) },
		deliverNotification: async notification => notifications.push(notification),
	})
	await check({ now: new Date('2026-11-09T00:01:01Z') })
	await check({ now: new Date('2026-11-09T00:01:02Z') })
	assert.equal(deployment.patrolCoverageState.candidateCount, 1)
	for (const seconds of [10, 20, 30]) {
		location = { ...location, recordedAt: new Date(`2026-11-09T00:01:${seconds}Z`) }
		await check({ now: location.recordedAt })
	}
	assert.deepEqual(notifications.map(n => n.recipientId).sort(), ['PNP-1', 'supervisor'])
	location = { ...location, recordedAt: new Date('2026-11-09T00:02:00Z') }
	await check({ now: new Date('2026-11-09T00:20:00Z') })
	assert.equal(notifications.length, 2)
})
