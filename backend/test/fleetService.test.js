const { it } = require('node:test')
const assert = require('node:assert/strict')
const { createFleetService, weekFor } = require('../src/services/fleetService')

it('only appends unassigned vehicles and never replaces a locked weekly crew', async () => {
	const calls = []
	let allowAppend = true
	const service = createFleetService({
		Personnel: { find: () => ({ select: () => ({ lean: async () => [{ personnelId: 'PNP-2' }] }) }) },
		FleetWeek: {
			create: async () => { const error = new Error('Existing week'); error.code = 11000; throw error },
			findOneAndUpdate: async (...args) => { calls.push(args); return allowAppend ? { weekStart: body.weekStart } : null },
		},
	})
	const body = { weekStart: weekFor(new Date()), crews: [{ vehicleId: 'car-2', driverId: 'PNP-2', personnelIds: ['PNP-2'] }] }
	await service.create(body, { id: 'supervisor' })
	assert.deepEqual(calls[0][0], { weekStart: body.weekStart, 'crews.vehicleId': { $nin: ['car-2'] }, 'crews.personnelIds': { $nin: ['PNP-2'] } })
	assert.deepEqual(calls[0][1], { $push: { crews: { $each: body.crews } } })
	allowAppend = false
	await assert.rejects(service.create(body, { id: 'supervisor' }), error => error.status === 409 && /cannot be replaced/.test(error.message))
})
