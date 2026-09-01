import Supercluster from 'supercluster'
import { describe, expect, it } from 'vitest'
import {
  createDevelopmentMapPersonnel,
  isDevelopmentMapPreviewEnabled,
  MOCK_MAP_PERSONNEL_COUNT,
} from './mockMapPersonnel'

const asClusterPoint = (member) => ({
  type: 'Feature',
  properties: { memberId: member.id },
  geometry: {
    type: 'Point',
    coordinates: [member.longitude, member.latitude],
  },
})

describe('development map personnel preview', () => {
  it('requires an explicit development-only query parameter', () => {
    expect(isDevelopmentMapPreviewEnabled('?mockMap=clusters', true)).toBe(true)
    expect(isDevelopmentMapPreviewEnabled('?mockMap=1', true)).toBe(true)
    expect(isDevelopmentMapPreviewEnabled('', true)).toBe(false)
    expect(isDevelopmentMapPreviewEnabled('?mockMap=clusters', false)).toBe(false)
  })

  it('creates unique, current map markers in dense cluster groups', () => {
    const personnel = createDevelopmentMapPersonnel({
      tick: 0,
      recordedAt: '2026-08-31T00:00:00.000Z',
    })
    const ids = new Set(personnel.map((member) => member.id))
    const index = new Supercluster({ radius: 56, maxZoom: 17 })
      .load(personnel.map(asClusterPoint))
    const visibleAtDefaultZoom = index.getClusters([121.6, 17.3, 122.1, 17.46], 12)

    expect(personnel).toHaveLength(MOCK_MAP_PERSONNEL_COUNT)
    expect(ids.size).toBe(MOCK_MAP_PERSONNEL_COUNT)
    expect(personnel.every((member) => (
      Number.isFinite(member.latitude)
      && Number.isFinite(member.longitude)
      && member.isVisibleOnMap
      && !member.isLocationStale
    ))).toBe(true)
    expect(visibleAtDefaultZoom.some((feature) => feature.properties.cluster)).toBe(true)
    expect(visibleAtDefaultZoom.length).toBeLessThan(MOCK_MAP_PERSONNEL_COUNT)
  })

  it('moves deterministically between tracker-like updates for interpolation testing', () => {
    const first = createDevelopmentMapPersonnel({
      tick: 0,
      recordedAt: '2026-08-31T00:00:00.000Z',
    })[0]
    const second = createDevelopmentMapPersonnel({
      tick: 1,
      recordedAt: '2026-08-31T00:00:10.000Z',
    })[0]

    expect([second.latitude, second.longitude]).not.toEqual([first.latitude, first.longitude])
    expect(second.locationRecordedAt).not.toBe(first.locationRecordedAt)
  })
})
