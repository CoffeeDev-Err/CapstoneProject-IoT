import { describe, expect, it } from 'vitest'
import { effectiveMarkerTarget, markerMotionForFixes } from './mapMotion'

describe('map marker motion', () => {
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
