import { describe, expect, it } from 'vitest'
import { coverageLabelFor, findPatrolArea, patrolAreaCatalog } from './patrolAreaCatalog'

describe('patrol area catalog', () => {
  it('contains every barangay as a barangay-wide coverage option', () => {
    const magassi = findPatrolArea('Barangay Magassi')
    expect(magassi).toMatchObject({
      id: 'barangay-magassi',
      category: 'barangay',
      coverageBarangays: ['MAGASSI'],
      defaultDeploymentType: 'area',
    })
  })

  it('describes a fixed zone through its parent barangay', () => {
    const market = findPatrolArea('cabagan-public-market-zone')
    expect(market).toMatchObject({
      category: 'zone',
      coverageBarangays: ['CENTRO'],
      defaultDeploymentType: 'point',
    })
    expect(coverageLabelFor(market)).toBe('Barangay Centro')
  })

  it('keeps route coverage explicit when no verified barangay list exists', () => {
    const route = findPatrolArea('Cabagan-Santa Maria Road')
    expect(route.category).toBe('route')
    expect(coverageLabelFor(route)).toBe('Multiple barangays along this route')
    expect(patrolAreaCatalog.length).toBeGreaterThan(26)
  })
})
