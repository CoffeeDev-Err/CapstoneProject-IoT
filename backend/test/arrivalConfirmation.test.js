const assert = require('node:assert/strict')
const { it } = require('node:test')
const createConfirmation = require('../src/services/operations/arrivalConfirmation')
const start = new Date('2026-11-16T00:00:00Z')
const fix = (seconds, extra = {}) => ({ source: 'gps', isSimulated: false, accuracy: 5,
	deviceAssignmentId: 'GPS-1', location: { type: 'Point', coordinates: [121.77, 17.42] },
	recordedAt: new Date(+start + seconds * 1000), ...extra })
const pair = (seconds, extra = {}) => ({ key: 'TASK-1:P-2', now: new Date(+start + seconds * 1000),
	acceptedAt: new Date(+start - 10_000), radius: 50, requester: fix(seconds), responder: fix(seconds), ...extra })

it('requires two new accurate fixes from both trackers, retains their evidence, and ignores repeated polls', () => {
	const confirm = createConfirmation()
	assert.equal(confirm(pair(0)), null)
	assert.equal(confirm(pair(0)), null)
	assert.equal(confirm(pair(10, { requester: fix(0) })), null)
	const evidence = confirm(pair(10))
	assert.equal(+evidence.first.responder.recordedAt, +start)
	assert.equal(+evidence.confirmed.requester.recordedAt, +start + 10_000)
	assert.equal(evidence.radiusMeters, 50)
})

it('does not confirm arrival when accuracy is unknown, poor, or exceeds the remaining radius', () => {
	for (const extra of [{ accuracy: undefined }, { accuracy: 100 }, { accuracy: 24, location: { coordinates: [121.77, 17.4203] } },
		{ positionValid: false }, { source: 'mock' }, { isSimulated: true }, { satellites: 2 }, { positionSource: 'lbs' }]) {
		const confirm = createConfirmation()
		for (const second of [0, 10, 20]) assert.equal(confirm(pair(second, { responder: fix(second, extra) })), null)
	}
})

it('clears confirmation after an uncertain fix, stale data, missing tracker or device reassignment', () => {
	for (const invalid of [{ responder: fix(10, { accuracy: undefined }) }, { responder: undefined },
		{ requester: fix(-60) }, { requester: fix(10, { deviceAssignmentId: 'NEW-GPS' }) }]) {
		const confirm = createConfirmation()
		assert.equal(confirm(pair(0)), null)
		assert.equal(confirm(pair(10, invalid)), null)
		assert.equal(confirm(pair(20)), null)
		assert.ok(confirm(pair(30)))
	}
})

it('does not combine pre-acceptance, future or widely separated readings into an arrival', () => {
	const confirm = createConfirmation()
	assert.equal(confirm(pair(0, { acceptedAt: new Date(+start + 1000) })), null)
	assert.equal(confirm(pair(0, { responder: fix(10) })), null)
	assert.equal(confirm(pair(10)), null)
	assert.equal(confirm(pair(50)), null)
	assert.ok(confirm(pair(60)))
})
