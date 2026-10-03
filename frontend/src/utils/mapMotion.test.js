import { describe, expect, it } from 'vitest'
import { effectiveMarkerTarget, markerMotionForFixes } from './mapMotion'

describe('map marker motion', () => {
  it('moves to a fresh two-meter fix even when the tracker reports zero speed', () => {
    const previous = { latitude: 17.4239, longitude: 121.7681, recordedAt: '2026-10-04T00:00:00Z', speed: 0 }
    const next = { ...previous, latitude: 17.423918, recordedAt: '2026-10-04T00:00:10Z' }
    const motion = markerMotionForFixes(previous, next)
    expect(motion.distanceMeters).toBeGreaterThan(1.9)
    expect(motion.distanceMeters).toBeLessThan(2.1)
    expect(motion.suppressJitter).toBe(false)
    expect(motion.durationMs).toBe(500)
    expect(effectiveMarkerTarget([previous.latitude, previous.longitude], next, motion.suppressJitter))
      .toEqual([next.latitude, next.longitude])
  })

  it('still filters small changes when no newer GPS measurement confirms movement', () => {
    const previous = { latitude: 17.4239, longitude: 121.7681, recordedAt: '2026-10-04T00:00:00Z', speed: 0 }
    expect(markerMotionForFixes(previous, { ...previous, latitude: 17.423918 }).suppressJitter).toBe(true)
  })

  it('catches up to a walking fix using the original half-second transition', () => {
    const motion = markerMotionForFixes(
      { latitude: 17.4239, longitude: 121.7681, recordedAt: '2026-10-03T04:00:00Z' },
      { latitude: 17.4240, longitude: 121.7682, recordedAt: '2026-10-03T04:00:10Z' },
    )
    expect(motion.durationMs).toBe(500)
  })

  it('does not suppress cumulative movement made of small GPS steps', () => {
    const rendered = [17.4239, 121.7681]
    expect(effectiveMarkerTarget(
      rendered,
      { latitude: 17.4239, longitude: 121.76812 },
      true,
    )).toBe(rendered)
    expect(effectiveMarkerTarget(
      rendered,
      { latitude: 17.4239, longitude: 121.76816 },
      true,
    )).toEqual([17.4239, 121.76816])
  })
})
