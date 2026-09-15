const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createPersonnelQueryService = require('../src/services/personnel/queryService')

const personnel = [
	{ id: 'OFF-DUTY', isOnDuty: false, mobileNumber: '09000000001' },
	{ id: 'ON-DUTY-1', isOnDuty: true, mobileNumber: '09000000002' },
	{ id: 'ON-DUTY-2', isOnDuty: true, mobileNumber: '09000000003' },
]

const createService = (overrides = {}) => createPersonnelQueryService({
	models: {
		CurrentLocation: {},
		Deployment: {},
		LocationHistory: {},
		Personnel: {},
		...overrides,
	},
})

describe('officer personnel-location visibility', () => {
	it('gives an off-duty officer only their own non-private personnel record', () => {
		const service = createService()
		const visible = service.scopePersonnelForActor(personnel, {
			role: 'officer', personnelId: 'OFF-DUTY',
		})

		assert.deepEqual(visible.map((member) => member.id), ['OFF-DUTY'])
		assert.equal(visible[0].mobileNumber, undefined)
	})

	it('allows an on-duty officer to see the current on-duty roster', () => {
		const service = createService()
		const visible = service.scopePersonnelForActor(personnel, {
			role: 'officer', personnelId: 'ON-DUTY-1',
		})

		assert.deepEqual(
			visible.map((member) => member.id),
			['ON-DUTY-1', 'ON-DUTY-2'],
		)
	})

	it('limits the REST personnel query to self when the requesting officer is off duty', async () => {
		let personnelFilter
		const profiles = [{
			personnelId: 'OFF-DUTY', badgeNumber: '10001', fullName: 'Off Duty Officer',
			rank: 'Patrolman', dutyStatus: 'Off Duty', status: 'active',
			updatedAt: new Date('2026-09-15T08:00:00Z'),
		}]
		const Personnel = {
			find: (filter) => {
				personnelFilter = filter
				return {
					sort() { return this },
					skip() { return this },
					limit() { return this },
					lean: async () => profiles,
				}
			},
			countDocuments: async () => profiles.length,
		}
		const service = createService({
			Personnel,
			Deployment: { distinct: async () => ['ON-DUTY-1'] },
			CurrentLocation: { find: () => ({ lean: async () => [] }) },
		})

		const result = await service.listPersonnel({}, {
			role: 'officer', personnelId: 'OFF-DUTY',
		})

		assert.deepEqual(personnelFilter.personnelId.$in, ['OFF-DUTY'])
		assert.equal(result.data.length, 1)
		assert.equal(result.data[0].id, 'OFF-DUTY')
		assert.equal(result.data[0].isVisibleOnMap, false)
	})
})
