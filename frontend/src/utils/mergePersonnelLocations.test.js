import { describe, expect, it } from 'vitest'
import { mergePersonnelLocations } from './mergePersonnelLocations'

describe('incoming GPS snapshots', () => {
  const now = Date.parse('2026-10-04T02:00:30Z')
  const latest = { id: 'PNP-1', name: 'Officer', source: 'gps', isOnDuty: true,
    latitude: 17.42, longitude: 121.77, locationRecordedAt: '2026-10-04T02:00:20Z' }
  const older = { ...latest, latitude: 17.41, locationRecordedAt: '2026-10-04T02:00:00Z' }

  it('preserves a newer streamed fix when a slower response arrives', () => {
    const [result] = mergePersonnelLocations([latest], [{ ...older, name: 'Updated name' }], now)
    expect(result.latitude).toBe(latest.latitude)
    expect(result.locationRecordedAt).toBe(latest.locationRecordedAt)
    expect(result.locationAgeSeconds).toBe(10)
    expect(result.name).toBe('Updated name')
  })

  it('accepts new readings even when the tracker has not moved', () => {
    const reading = { ...latest, locationRecordedAt: '2026-10-04T02:00:28Z' }
    expect(mergePersonnelLocations([latest], [reading], now)).toEqual([reading])
  })

  it('honors removal and off-duty visibility', () => {
    expect(mergePersonnelLocations([latest], [], now)).toEqual([])
    expect(mergePersonnelLocations([latest], [{ ...older, isOnDuty: false }], now)[0].isVisibleOnMap).toBe(false)
  })

  it('keeps stale retained fixes visible at their last coordinates and actual timestamp', () => {
    const [result] = mergePersonnelLocations([latest], [older], now + 180_000)
    expect(result.isLocationStale).toBe(true)
    expect(result.isVisibleOnMap).toBe(true)
    expect(result.latitude).toBe(latest.latitude)
    expect(result.locationRecordedAt).toBe(latest.locationRecordedAt)
    expect(result.locationAgeSeconds).toBe(190)
    expect(result.locationStatus).toBe('stale')
    expect(result.isInsideCabagan).toBeNull()
  })

  it('resumes with the newest measurement after a long outage', () => {
    const [stale] = mergePersonnelLocations([latest], [older], now + 600_000)
    const fresh = { ...latest, latitude: 17.425, locationRecordedAt: new Date(now + 600_000).toISOString() }
    expect(mergePersonnelLocations([stale], [fresh], now + 600_000)).toEqual([fresh])
  })
})
