const { it } = require('node:test')
const assert = require('node:assert/strict')
const { getPatrolDirections } = require('../src/services/patrolMapService')
const { hydratePatrolGeometry } = require('../src/services/patrolCoverageService')
const points = [{ latitude: 17.43, longitude: 121.765 }, { latitude: 17.431, longitude: 121.766 }]
const geometry = { type: 'LineString', coordinates: [[121.765, 17.43], [121.7655, 17.4308], [121.766, 17.431]] }

it('returns road distance and duration for navigation without changing the saved route contract', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry, distance: 200, duration: 90 }] }) }))
  assert.deepEqual(await getPatrolDirections({ points, mode: 'car' }), { available: true, geometry, distanceMeters: 200, durationSeconds: 90 })
})
it('never uses a driving profile for foot patrol and retains manual walkway points', async t => {
  const before = process.env.OSRM_WALK_ROUTE_URL
  delete process.env.OSRM_WALK_ROUTE_URL
  t.after(() => { if (before === undefined) delete process.env.OSRM_WALK_ROUTE_URL; else process.env.OSRM_WALK_ROUTE_URL = before })
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not request driving directions') })
  assert.equal((await getPatrolDirections({ points, mode: 'walk' })).available, false)
  const assignments = [{ id: 'D1', patrolMode: 'walk', scheduleBlocks: [{ coverageType: 'route', routePoints: points }] }]
  await hydratePatrolGeometry(assignments, new Map())
  assert.equal(fetch.mock.callCount(), 0)
  assert.deepEqual(assignments[0].scheduleBlocks[0].geometry.coordinates, points.map(p => [p.longitude, p.latitude]))
  assert.equal(assignments[0].scheduleBlocks[0].roadDirections, false)
})
it('hydrates walking geometry only from the configured walking service', async t => {
  const before = process.env.OSRM_WALK_ROUTE_URL
  process.env.OSRM_WALK_ROUTE_URL = 'https://walking.example/route/v1/foot'
  t.after(() => { if (before === undefined) delete process.env.OSRM_WALK_ROUTE_URL; else process.env.OSRM_WALK_ROUTE_URL = before })
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry, distance: 200, duration: 180 }] }) }))
  const assignments = [{ id: 'D1', patrolMode: 'walk', scheduleBlocks: [{ coverageType: 'route', routePoints: points }] }]
  await hydratePatrolGeometry(assignments, new Map())
  assert.match(fetch.mock.calls[0].arguments[0], /^https:\/\/walking\.example\//)
  assert.deepEqual(assignments[0].scheduleBlocks[0].geometry, geometry)
  assert.equal(assignments[0].scheduleBlocks[0].roadDirections, true)
})
it('rejects malformed routing geometry so it cannot be shown as an enforced path', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[null, 17.43]] } }] }) }))
  assert.equal((await getPatrolDirections({ points, mode: 'car' })).available, false)
})
