import { describe, expect, it } from 'vitest'
import { evaluateGeofenceTransition, mergeNotifications, mergeReports, upsertTask } from './realtimeState'

describe('realtime state transitions', () => {
  it('merges report aliases idempotently', () => {
    const original = [{ id: 'R-1', title: 'Original', case_status: 'open' }]
    expect(mergeReports(original, [{ report_id: 'R-1', case_status: 'resolved' }]))
      .toEqual([{ id: 'R-1', title: 'Original', case_status: 'resolved', report_id: 'R-1' }])
    expect(mergeReports(original, [])).toBe(original)
  })

  it('upserts tasks without duplicates', () => {
    expect(upsertTask([{ id: 'T-1', status: 'open' }], { id: 'T-1', status: 'full' }))
      .toEqual([{ id: 'T-1', status: 'full' }])
  })

  it('reports exits and recovery across geofence snapshots', () => {
    const first = evaluateGeofenceTransition([{ id: 'P-1', isInsideCabagan: false }])
    expect(first.newlyOutside).toHaveLength(1)
    expect(evaluateGeofenceTransition(
      [{ id: 'P-1', isInsideCabagan: true }],
      first.outsideIds,
    ).hasRecovered).toBe(true)
  })

  it('deduplicates notification history in newest-first order', () => {
    const result = mergeNotifications(
      [{ id: 'N-2', timestamp: '2026-01-02T00:00:00Z' }],
      [{ id: 'N-1', timestamp: '2026-01-01T00:00:00Z' }, { id: 'N-2', timestamp: '2020-01-01T00:00:00Z' }],
      25,
    )
    expect(result.map(({ id }) => id)).toEqual(['N-2', 'N-1'])
  })
})
