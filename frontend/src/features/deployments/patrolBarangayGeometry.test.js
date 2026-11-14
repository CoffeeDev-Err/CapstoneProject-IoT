import { expect, it } from 'vitest'
import geography from '../../../../contracts/geography/cabagan-geography.json'
import { barangayAtPoint, pointInBarangay } from './patrolBarangayGeometry'

it('selects the correct barangay at every verified interior label point', () => {
  for (const feature of geography.barangays.features) {
    expect(barangayAtPoint(geography.barangays, feature.properties.center)?.properties.barangay).toBe(feature.properties.barangay)
  }
  expect(barangayAtPoint(geography.barangays, { latitude: 0, longitude: 0 })).toBeUndefined()
})

it('includes edges without accepting arbitrary outside points from a closed ring', () => {
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }
  expect(pointInBarangay({ longitude: 2, latitude: 1 }, geometry)).toBe(true)
  expect(pointInBarangay({ longitude: 3, latitude: 1 }, geometry)).toBe(false)
  expect(pointInBarangay({ longitude: NaN, latitude: 1 }, geometry)).toBe(false)
})
