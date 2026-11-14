const assert = require('node:assert/strict')
const { it, mock } = require('node:test')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const geography = require('../../contracts/geography/cabagan-geography.json')
const mobile = require('../../bantaycabagan-mobileapp/src/constants/data/cabagan-geography.json')
const { isInsideCabagan } = require('../src/utils/cabaganGeofence')
const { insideGeometry, outsideCoverage, hydratePatrolGeometry } = require('../src/services/patrolCoverageService')
const { loadBarangayBoundaries } = require('../src/services/patrolMapService')
const { normalizePatrolSchedule } = require('../src/services/patrolSchedule')

it('retains a saved route at a corrected edge but rejects the same point on a new or moved route', () => {
  const assignment = { personnelId: 'PNP-1', deploymentType: 'route', patrolMode: 'walk', shiftStart: '2026-11-15T00:00:00Z', shiftEnd: '2026-11-15T02:00:00Z',
    scheduleBlocks: [{ label: 'Saved route', durationMinutes: 120, coverageType: 'route', routePoints: [{ latitude: 17.43, longitude: 121.76 }, { latitude: 17.44, longitude: 121.77 }] }] }
  assert.throws(() => normalizePatrolSchedule(assignment), /inside Cabagan/)
  assert.equal(normalizePatrolSchedule(assignment, assignment).scheduleBlocks[0].routePoints[1].latitude, 17.44)
  assert.throws(() => normalizePatrolSchedule({ ...assignment, personnelId: 'PNP-2' }, assignment), /inside Cabagan/)
  assert.throws(() => normalizePatrolSchedule({ ...assignment, scheduleBlocks: [{ ...assignment.scheduleBlocks[0], routePoints: [{ latitude: 17.44, longitude: 121.77001 }, assignment.scheduleBlocks[0].routePoints[0]] }] }, assignment), /inside Cabagan/)
})

it('reproduces the contract from unchanged downloads and ships identical mobile data', () => {
  execFileSync(process.execPath, [path.resolve(__dirname, '../../scripts/build-cabagan-geography.cjs'), '--check'])
  assert.deepEqual(mobile, geography)
})

it('keeps all 26 labels strictly inside their own coverage and the municipality, including Tallag', () => {
  for (const feature of geography.barangays.features) {
    const { latitude, longitude } = feature.properties.center
    assert.equal(insideGeometry(longitude, latitude, feature.geometry), true, feature.properties.barangay)
    const navigation = feature.properties.navigationCenter
    assert.equal(insideGeometry(navigation.longitude, navigation.latitude, feature.geometry), true, feature.properties.barangay)
    assert.equal(isInsideCabagan(latitude, longitude), true, feature.properties.barangay)
    assert.equal(outsideCoverage({ coverageType: 'barangay', geometry: feature.geometry }, [longitude, latitude]), false)
    // Every edge, including newly inserted municipal bends, stays in Cabagan.
    const ring = feature.geometry.coordinates[0]
    for (let i = 1; i < ring.length; i++) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const a = ring[i - 1], b = ring[i]
      assert.equal(isInsideCabagan(a[1] + t * (b[1] - a[1]), a[0] + t * (b[0] - a[0])), true, feature.properties.barangay)
    }
  }
})

it('uses detailed municipal bends where the old simplified polygon disagreed', () => {
  assert.equal(isInsideCabagan(17.4298, 121.693530874), true)
  assert.equal(isInsideCabagan(17.36526987888336, 121.78634409932327), false)
  assert.equal(isInsideCabagan(0, 0), false)
})

it('loads complete coverage offline and preserves legacy snapshots on an ordinary edit', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Offline') })
  try {
    assert.equal((await loadBarangayBoundaries()).features.length, 26)
    const old = { label: 'Tallag', coverageType: 'barangay', barangay: 'Tallag', latitude: 17.4259, longitude: 121.7225, geometry: { type: 'Polygon', coordinates: [[[121.72, 17.42], [121.73, 17.42], [121.72, 17.43], [121.72, 17.42]]] }, boundarySource: 'saved-version' }
    const assignment = { id: 'existing', scheduleBlocks: [{ ...old, geometry: undefined }] }
    await hydratePatrolGeometry([assignment], new Map([['existing', { scheduleBlocks: [old] }]]))
    assert.deepEqual(assignment.scheduleBlocks[0], old)
    assert.equal(assignment.latitude, old.latitude)
    const legacy = { ...old, geometry: null }
    await hydratePatrolGeometry([assignment], new Map([['existing', { scheduleBlocks: [legacy] }]]))
    assert.equal(assignment.scheduleBlocks[0].geometry, null)
    const fresh = { id: 'new', scheduleBlocks: [{ coverageType: 'barangay', barangay: 'Tallag' }] }
    await hydratePatrolGeometry([fresh], new Map())
    assert.deepEqual(fresh.scheduleBlocks[0].geometry, geography.barangays.features.find(f => f.properties.barangay === 'Tallag').geometry)
    assert.match(fresh.scheduleBlocks[0].boundarySource, new RegExp(geography.version))
    assert.equal(fetch.mock.callCount(), 0)
  } finally { fetch.mock.restore() }
})
