const assert = require('node:assert/strict')
const { it } = require('node:test')
const { resolveIncidentLocation } = require('../src/services/incidentLocationService')

it('resolves the incident address without accepting deployment area as a substitute', async () => {
	const result = await resolveIncidentLocation({ latitude: '17.4305', longitude: '121.765', assigned_area: 'Cubag' },
		async () => 'Eastern, Catabayungan, Cabagan')
	assert.equal(result.barangay, 'Catabayungan')
})
it('returns no guessed barangay for unavailable or ambiguous addresses', async () => {
	for (const name of ['GPS 17.43050, 121.76500', 'Centro, Cubag, Cabagan']) {
		assert.equal((await resolveIncidentLocation({ latitude: 17.4305, longitude: 121.765 }, async () => name)).barangay, '')
	}
})
it('rejects invalid and out-of-service-area coordinates before geocoding', async () => {
	for (const latitude of ['', null, [], 'NaN', 91, 14.6]) {
		await assert.rejects(resolveIncidentLocation({ latitude, longitude: 121.765 }), { status: 400 })
	}
})
