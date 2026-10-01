const assert = require('node:assert/strict')
const { it } = require('node:test')
const createLocationIngestionService = require('../src/services/personnel/locationIngestionService')

it('does not store a direct GPS reading when the assigned officer is off duty', async () => {
	const now = new Date()
	let locationWriteAttempted = false
	let historyWriteAttempted = false
	const current = {
		personnelId: 'PNP-001', source: 'gps', recordedAt: new Date(now.getTime() - 60_000),
		location: { type: 'Point', coordinates: [121.77, 17.42] },
	}
	const service = createLocationIngestionService({
		clock: () => now,
		currentShiftFilter: () => ({}),
		serializePersonnel: (_profile, location, options) => ({ location, ...options }),
		models: {
			GpsDeviceAssignment: {
				findOne: () => ({ lean: async () => ({
					assignmentId: 'GPS-001', personnelId: 'PNP-001', imei: '123456789012345',
				}) }),
			},
			Personnel: {
				findOne: () => ({ lean: async () => ({ personnelId: 'PNP-001' }) }),
			},
			Deployment: {
				findOne: () => ({ select: () => ({ lean: async () => null }) }),
			},
			CurrentLocation: {
				findOne: async () => current,
				findOneAndUpdate: async () => { locationWriteAttempted = true },
			},
			LocationHistory: {
				findOne: () => { historyWriteAttempted = true; throw new Error('Unexpected history read') },
				create: async () => { historyWriteAttempted = true },
			},
		},
	})

	const result = await service.ingestLocation({
		imei: '123456789012345',
		latitude: 17.42,
		longitude: 121.77,
		battery_level: 50,
		recorded_at: now.toISOString(),
		source: 'gps',
	})

	assert.equal(result.accepted, false)
	assert.equal(result.reason, 'off_duty')
	assert.equal(result.personnel.isOnDuty, false)
	assert.equal(locationWriteAttempted, false)
	assert.equal(historyWriteAttempted, false)
})
