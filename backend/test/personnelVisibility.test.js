const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createPersonnelQueryService = require('../src/services/personnel/queryService')

const personnel = [
	{ id: 'OFF-DUTY', isOnDuty: false, mobileNumber: '09000000001' },
	{ id: 'ON-DUTY-1', isOnDuty: true, mobileNumber: '09000000002' },
	{ id: 'ON-DUTY-2', isOnDuty: true, mobileNumber: '09000000003' },
]

const createService = (overrides = {}, clock) => createPersonnelQueryService({
	clock,
	models: {
		CurrentLocation: {},
		Deployment: {},
		LocationHistory: {},
		Personnel: {},
		...overrides,
	},
})

describe('last known map positions', () => {
	const now = new Date('2026-11-05T02:00:00Z')
	const profile = { personnelId: 'PNP-001', fullName: 'Officer One', dutyStatus: 'On Duty' }
	const saved = {
		source: 'gps', isSimulated: false,
		location: { coordinates: [121.77, 17.42] },
		locationName: 'Saved patrol location',
		recordedAt: new Date('2026-11-05T01:50:00Z'),
		receivedAt: new Date('2026-11-05T01:50:02Z'),
	}

	it('keeps an on-duty sleeping or disconnected tracker visible without refreshing its clock', () => {
		const service = createService({}, () => now)
		const member = service.serializePersonnel(profile, saved, { isOnDuty: true })
		assert.equal(member.isVisibleOnMap, true)
		assert.equal(member.isLocationStale, true)
		assert.equal(member.locationStatus, 'stale')
		assert.equal(member.locationAgeSeconds, 600)
		assert.equal(member.locationRecordedAt, saved.recordedAt.toISOString())
		assert.equal(member.locationReceivedAt, saved.receivedAt.toISOString())
		assert.equal(member.latitude, 17.42)
		assert.equal(member.longitude, 121.77)
		assert.ok(member.lastKnownLocationName)
	})

	it('still hides off-duty officers and records without coordinates', () => {
		const service = createService({}, () => now)
		assert.equal(service.serializePersonnel(profile, saved, { isOnDuty: false }).isVisibleOnMap, false)
		const missing = service.serializePersonnel(profile, null, { isOnDuty: true })
		assert.equal(missing.isVisibleOnMap, false)
		assert.equal(missing.latitude, null)
		assert.equal(missing.longitude, null)
	})

	it('replaces the last known position with a fresh accepted measurement', () => {
		const service = createService({}, () => now)
		const fresh = { ...saved, recordedAt: now, location: { coordinates: [121.771, 17.421] } }
		const member = service.serializePersonnel(profile, fresh, { isOnDuty: true })
		assert.equal(member.isVisibleOnMap, true)
		assert.equal(member.isLocationStale, false)
		assert.equal(member.locationAgeSeconds, 0)
		assert.equal(member.latitude, 17.421)
		assert.equal(member.longitude, 121.771)
	})
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
