const assert = require('node:assert/strict')
const { it } = require('node:test')
const createService = require('../src/services/operations/reportRoadMatchingService')

const points = (offset = 0) => [0, 10, 20].map((seconds, index) => ({
	latitude: 17.4 + index * 0.0003, longitude: 121.7, accuracy: 4, speed: 10,
	recorded_at: new Date(Date.UTC(2026, 9, 6, 6, 0, offset + seconds)).toISOString(),
}))
const matchedResponse = samples => ({ code: 'Ok',
	tracepoints: samples.map(point => ({ matchings_index: 0, alternatives_count: 0, location: [point.longitude, point.latitude] })),
	matchings: [{ confidence: 0.95, geometry: { type: 'LineString', coordinates: samples.map(point => [point.longitude, point.latitude]) } }],
})
const environment = { REPORT_MAP_MATCHING_URL: 'https://matching.example.org' }
const roadResponse = samples => {
	const body = matchedResponse(samples)
	body.tracepoints.forEach((point, index) => { point.waypoint_index = index })
	body.matchings[0].legs = samples.slice(1).map((point, index) => {
		const start = body.tracepoints[index].location
		const end = [point.longitude, point.latitude]
		const corner = [start[0] + 0.00002, (start[1] + end[1]) / 2]
		return { steps: [{ geometry: { type: 'LineString', coordinates: [start, corner, end] } },
			{ geometry: { type: 'LineString', coordinates: [end, end] } }] }
	})
	return body
}
const longerTrace = count => Array.from({ length: count }, (_, index) => ({
	...points()[0], latitude: 17.4 + index * 0.0003,
	recorded_at: new Date(Date.UTC(2026, 9, 6, 6, 0, index * 10)).toISOString(),
}))
const matchBody = (samples, body) => createService({ environment,
	fetchImpl: async () => ({ ok: true, json: async () => body }),
}).match(samples)

it('does not contact a provider unless an approved base URL is configured', async () => {
	let requests = 0
	for (const url of ['', 'not-a-url', 'file:///tmp/route', 'https://user:secret@matching.example.org', 'https://matching.example.org?token=secret']) {
		const service = createService({ environment: { REPORT_MAP_MATCHING_URL: url }, fetchImpl: async () => { requests++ } })
		assert.equal(service.isAvailable(), false)
		assert.equal((await service.match(points())).status, 'disabled')
	}
	assert.equal(requests, 0)
})

it('matches only display coordinates, sends source times and accuracy, caches requests, and leaves raw readings unchanged', async () => {
	const samples = points()
	samples[1].accuracy = null
	const original = JSON.stringify(samples)
	let requests = 0
	const service = createService({ environment, fetchImpl: async (url, options) => {
		requests++
		assert.equal(url.pathname.startsWith('/match/v1/driving/'), true)
		assert.equal(url.searchParams.get('radiuses'), '4;25;4')
		assert.equal(url.searchParams.get('gaps'), 'split')
		assert.equal(url.searchParams.get('tidy'), 'false')
		assert.equal(url.searchParams.get('steps'), 'true')
		assert.equal(url.searchParams.get('timestamps').split(';').length, 3)
		assert.equal(options.redirect, 'error')
		return { ok: true, json: async () => matchedResponse(samples) }
	} })
	const [first, second] = await Promise.all([service.match(samples), service.match(samples)])
	assert.deepEqual(first, second)
	assert.equal(requests, 1)
	assert.equal(first.status, 'matched')
	assert.equal(first.inference, true)
	assert.equal(first.assumed_accuracy_radius_m, 25)
	assert.equal(first.segments.length, 1)
	assert.equal(JSON.stringify(samples), original)
})

it('rejects low confidence, ambiguous matches, excessive snapping and invalid coordinates', async () => {
	const samples = points()
	for (const mutate of [
		body => { body.matchings[0].confidence = 0.6 },
		body => { body.tracepoints[1].alternatives_count = 1 },
		body => { body.tracepoints[1].location = [121.9, 17.4] },
		body => { body.tracepoints[1].location = [null, null] },
		body => { body.matchings[0].geometry.coordinates[1] = [900, 900] },
		body => { body.tracepoints[1] = null },
	]) {
		const body = matchedResponse(samples); mutate(body)
		const service = createService({ environment, fetchImpl: async () => ({ ok: true, json: async () => body }) })
		const result = await service.match(samples)
		assert.equal(result.status, 'no_confident_match')
		assert.equal(result.segments.length, 0)
	}
})

it('keeps trusted road bends while excluding an ambiguous endpoint and its entire road leg', async () => {
	const samples = longerTrace(6)
	const original = JSON.stringify(samples)
	for (const uncertainIndex of [0, 5]) {
		const body = roadResponse(samples)
		body.tracepoints[uncertainIndex].alternatives_count = 1
		const result = await matchBody(samples, body)
		assert.equal(result.status, 'partial')
		assert.equal(result.segments.length, 1)
		const firstIndex = uncertainIndex === 0 ? 1 : 0
		const lastIndex = uncertainIndex === 5 ? 4 : 5
		assert.equal(result.segments[0].from, samples[firstIndex].recorded_at)
		assert.equal(result.segments[0].to, samples[lastIndex].recorded_at)
		const expectedRoad = body.matchings[0].legs.slice(firstIndex, lastIndex)
			.flatMap((leg, index) => leg.steps[0].geometry.coordinates.slice(index === 0 ? 0 : 1))
		assert.deepEqual(result.segments[0].coordinates, expectedRoad)
		assert.equal(result.inference, true)
		assert.equal(JSON.stringify(samples), original)
	}
})

it('leaves separate trusted road sections disconnected around uncertain or unmatched readings', async () => {
	const samples = longerTrace(7)
	for (const mutate of [
		body => { body.tracepoints[3].alternatives_count = 1 },
		body => { body.tracepoints[3] = null },
		body => { body.tracepoints[3].location = [121.9, 17.4] },
	]) {
		const body = roadResponse(samples); mutate(body)
		const result = await matchBody(samples, body)
		assert.equal(result.status, 'partial')
		assert.equal(result.segments.length, 2)
		assert.equal(result.segments[0].to, samples[2].recorded_at)
		assert.equal(result.segments[1].from, samples[4].recorded_at)
		assert.deepEqual(result.segments[0].coordinates.at(-1), [samples[2].longitude, samples[2].latitude])
		assert.deepEqual(result.segments[1].coordinates[0], [samples[4].longitude, samples[4].latitude])
	}
})

it('does not substitute an overview or invent connections when road legs are missing or inconsistent', async () => {
	const samples = longerTrace(5)
	for (const mutate of [
		body => { body.matchings[0].legs[1].steps = [] },
		body => { body.matchings[0].legs[1].steps[0].geometry.coordinates[1] = [900, 900] },
		body => { body.matchings[0].legs[1].steps[0].geometry.coordinates[0] = [121.71, 17.4] },
		body => { body.matchings[0].legs[1].steps[1].geometry.coordinates = [[121.71, 17.4], [121.71, 17.4]] },
		body => { body.matchings[0].legs[1].steps[0].geometry.coordinates[1] = [121.71, 17.4] },
		body => { body.tracepoints[2].waypoint_index = 8 },
		body => { delete body.matchings[0].legs; body.tracepoints[4].alternatives_count = 1 },
	]) {
		const body = roadResponse(samples); mutate(body)
		const result = await matchBody(samples, body)
		assert.equal(result.status, 'no_confident_match')
		assert.deepEqual(result.segments, [])
	}
})

it('splits missing updates and invalid fixes rather than creating a road connection across them', async () => {
	const samples = [...points(), ...points(100)]
	let requests = 0
	const service = createService({ environment, fetchImpl: async url => {
		const chunk = url.pathname.split('/').at(-1).split(';').map((pair, index) => ({
			longitude: Number(pair.split(',')[0]), latitude: Number(pair.split(',')[1]), recorded_at: samples[requests * 3 + index].recorded_at,
		}))
		requests++
		return { ok: true, json: async () => matchedResponse(chunk) }
	} })
	const result = await service.match(samples)
	assert.equal(requests, 2)
	assert.equal(result.segments.length, 2)
	assert.equal(result.segments[0].to, samples[2].recorded_at)
	assert.equal(result.segments[1].from, samples[3].recorded_at)
	assert.equal((await service.match(points().map(point => ({ ...point, position_valid: false })))).status, 'insufficient_movement')
})

it('fails safely for transport errors and does not cache a transient provider failure', async () => {
	let calls = 0
	const service = createService({ environment, fetchImpl: async () => {
		calls++
		if (calls === 1) throw new Error('offline')
		return { ok: true, json: async () => matchedResponse(points()) }
	} })
	assert.equal((await service.match(points())).status, 'unavailable')
	assert.equal((await service.match(points())).status, 'matched')
	assert.equal(calls, 2)
})

it('bounds request size and excludes stationary noise and impossible jumps', async () => {
	const service = createService({ environment, fetchImpl: async () => { throw new Error('must not fetch') } })
	const longTrace = Array.from({ length: 500 }, (_, index) => ({
		latitude: 17.4 + index * 0.0003, longitude: 121.7, accuracy: 4,
		recorded_at: new Date(Date.UTC(2026, 9, 6, 6, 0, index * 10)).toISOString(),
	}))
	assert.equal((await service.match(longTrace)).status, 'trace_too_large')
	assert.equal((await service.match(points().map(point => ({ ...point, speed: 0 })))).status, 'insufficient_movement')
	const jumps = points(); jumps[1].latitude = 18.4
	assert.equal((await service.match(jumps)).status, 'insufficient_movement')
})

it('aborts a slow provider within the overall deadline and returns raw-layer fallback', async context => {
	context.mock.timers.enable({ apis: ['setTimeout'] })
	const service = createService({ environment, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
		signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
	}) })
	const pending = service.match(points())
	context.mock.timers.tick(8000)
	assert.equal((await pending).status, 'unavailable')
})
