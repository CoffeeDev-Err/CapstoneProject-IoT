import { expect, it } from 'vitest'
import { groupCheckpoints, hourlySequenceFeatures, phtDate } from './dutyGpsHistory'
import { buildReportRouteTrace } from './reportRouteTrace'
const checkpoint = (hour, longitude = 121.77) => ({ hour, checkpoint: { latitude: 17.42, longitude } })
it('groups coincident hourly dots without losing their individually selectable hours', () => {
  const hours = [checkpoint(0), checkpoint(1), checkpoint(2, 121.78), { hour: 3, checkpoint: null }]
  expect(groupCheckpoints(hours).map(group => group.map(hour => hour.hour))).toEqual([[0, 1], [2]])
  expect(groupCheckpoints([checkpoint(0), checkpoint(1, 121.77001)])).toHaveLength(1)
})
it('draws directional sequence hints between adjacent valid hours and breaks missing hours', () => {
  const features = hourlySequenceFeatures([checkpoint(0), checkpoint(1, 121.78), { hour: 2, checkpoint: null }, checkpoint(3, 121.79)])
  expect(features).toHaveLength(2)
  expect(features[0].properties.kind).toBe('hourly_sequence')
  expect(features[1].properties.kind).toBe('hourly_arrow')
  expect(hourlySequenceFeatures([checkpoint(0), checkpoint(1)])).toHaveLength(0)
})
it('uses the Philippine calendar day and breaks a detailed trace across device reassignments', () => {
  expect(phtDate(Date.parse('2026-11-04T16:00:00Z'))).toBe('2026-11-05')
  const points = Array.from({ length: 4 }, (_, index) => ({ latitude: 17.42 + .0002 * index, longitude: 121.77,
    recorded_at: new Date(Date.UTC(2026, 10, 5, 0, 0, index * 10)).toISOString(), device_assignment_id: index < 2 ? 'GPS-1' : 'GPS-2', speed: 5 }))
  expect(buildReportRouteTrace(points).segments.map(segment => segment.length)).toEqual([2, 2])
})
