const assert = require('node:assert/strict')
const { it } = require('node:test')
const createGpsFixGuard = require('../src/services/personnel/gpsFixGuard')

const baseTime = Date.parse('2026-11-04T02:00:00Z')
const setup = () => {
	let now = baseTime
	const guard = createGpsFixGuard({ clock: () => now })
	const current = {
		source: 'gps', deviceAssignmentId: 'A-1', speed: 0,
		recordedAt: new Date(baseTime),
		location: { coordinates: [121.764672, 17.430762] },
	}
	const check = (seconds, fix = {}, options = {}) => guard.check({
		personnelId: 'P-1', assignmentId: 'A-1', current,
		...options,
		fix: { coordinates: [121.764672, 17.430762], recordedAt: new Date(baseTime + seconds * 1000), speed: 0, ...fix },
	})
	return { guard, current, check, setNow: (value) => { now = value } }
}

it('holds the CSV GPS-001 outlier after a gap and accepts its return fix immediately', () => {
	const { current, check } = setup()
	current.recordedAt = new Date('2026-11-04T02:09:07Z')
	assert.equal(check(1791, { coordinates: [121.764310, 17.430642], speed: 1, satellites: 20 }), 'gps_jump_pending')
	assert.equal(check(1801, { coordinates: [121.764648, 17.430753], speed: 0, satellites: 28 }), null)
})

it('requires a different fresh fix to confirm a legitimate relocation', () => {
	const { check } = setup()
	const fix = { coordinates: [121.775, 17.43] }
	assert.equal(check(60, fix), 'gps_jump_pending')
	assert.equal(check(60, fix), 'gps_jump_pending')
	assert.equal(check(59, fix), 'gps_jump_pending')
	assert.equal(check(61, fix), 'gps_jump_pending')
	assert.equal(check(70, { coordinates: [121.77501, 17.43001] }), null)
})

it('does not confirm a jump with a second unrelated distant position', () => {
	const { check } = setup()
	assert.equal(check(60, { coordinates: [121.775, 17.43] }), 'gps_jump_pending')
	assert.equal(check(70, { coordinates: [121.79, 17.44] }), 'gps_jump_pending')
})

it('holds impossible travel even when speed and quality are unavailable', () => {
	const { check } = setup()
	assert.equal(check(10, { coordinates: [121.78, 17.43], speed: undefined }), 'gps_jump_pending')
})

it('holds a large low-speed jump while preserving short movements at zero speed', () => {
	const { check } = setup()
	assert.equal(check(10, { coordinates: [121.76431, 17.430642], speed: 1 }), 'gps_jump_pending')
	assert.equal(check(20, { coordinates: [121.764672, 17.430780], speed: 0 }), null)
})

it('accepts normal walking and vehicle travel without waiting for confirmation', () => {
	const { check } = setup()
	assert.equal(check(10, { coordinates: [121.764672, 17.4309], speed: 5 }), null)
	assert.equal(check(10, { coordinates: [121.7655, 17.430762], speed: 36 }), null)
	assert.equal(check(60, { coordinates: [121.77, 17.430762], speed: 36 }), null)
})

it('does not delay a stopped vehicle when its preceding fix reports travel', () => {
	const { current, check } = setup()
	current.speed = 36
	assert.equal(check(10, { coordinates: [121.7655, 17.430762], speed: 0 }), null)
})

it('accepts repeated stationary coordinates and ordinary legacy readings without quality', () => {
	const { check } = setup()
	assert.equal(check(10), null)
	assert.equal(check(20, { coordinates: [121.7647, 17.430762], speed: undefined }), null)
})

it('rejects explicitly poor quality, including on the first fix, but allows missing quality', () => {
	const { check } = setup()
	assert.equal(check(10, { satellites: 2 }), 'poor_gps_quality')
	assert.equal(check(10, { accuracy: 1000 }), 'poor_gps_quality')
	assert.equal(check(10, { satellites: 0 }, { current: null }), 'poor_gps_quality')
	assert.equal(check(10, {}, { current: null }), null)
	assert.equal(check(10, { satellites: 4, accuracy: 100 }), null)
})

it('expires unconfirmed candidates instead of using an old fix as confirmation', () => {
	const { check, setNow } = setup()
	const fix = { coordinates: [121.775, 17.43] }
	assert.equal(check(60, fix), 'gps_jump_pending')
	setNow(baseTime + 31_000)
	assert.equal(check(70, fix), 'gps_jump_pending')
	assert.equal(check(80, fix), null)
})

it('does not confirm against a candidate separated by more than thirty measurement seconds', () => {
	const { check } = setup()
	const fix = { coordinates: [121.775, 17.43] }
	assert.equal(check(60, fix), 'gps_jump_pending')
	assert.equal(check(100, fix), 'gps_jump_pending')
})

it('isolates candidates by officer and device assignment', () => {
	const { check } = setup()
	const fix = { coordinates: [121.775, 17.43] }
	assert.equal(check(60, fix), 'gps_jump_pending')
	assert.equal(check(70, fix, { personnelId: 'P-2' }), 'gps_jump_pending')
	assert.equal(check(70, fix, { assignmentId: 'A-2', current: { source: 'gps', recordedAt: new Date(baseTime), location: { coordinates: [121.764672, 17.430762] } } }), 'gps_jump_pending')
})

it('does not use the old device or a mock position as a movement baseline', () => {
	const { current, check } = setup()
	assert.equal(check(10, { coordinates: [121.8, 17.4] }, { assignmentId: 'A-2' }), null)
	current.source = 'mock'
	assert.equal(check(10, { coordinates: [121.8, 17.4] }), null)
})

it('clears confirmation evidence after a poor-quality fix or explicit reset', () => {
	const { guard, check } = setup()
	const fix = { coordinates: [121.775, 17.43] }
	assert.equal(check(60, fix), 'gps_jump_pending')
	assert.equal(check(65, { ...fix, accuracy: 1000 }), 'poor_gps_quality')
	assert.equal(check(70, fix), 'gps_jump_pending')
	guard.clear('P-1')
	assert.equal(check(80, fix), 'gps_jump_pending')
})
