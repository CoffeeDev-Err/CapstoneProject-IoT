import { expect, it } from 'vitest'
import { buildReportRouteTrace } from './reportRouteTrace'

const point = (seconds, latitude, options = {}) => ({ latitude, longitude: 121.7, accuracy: 5,
  recorded_at: new Date(Date.UTC(2026, 9, 5, 6, 0, seconds)).toISOString(), ...options })

it('keeps sustained movement but suppresses stationary variation within GPS accuracy', () => {
  const samples = [point(0, 17.4), point(60, 17.40002), point(120, 17.39999), point(180, 17.4003), point(240, 17.4006)]
  const original = JSON.stringify(samples)
  const trace = buildReportRouteTrace(samples)
  expect(trace.simplified).toBe(2)
  expect(trace.segments).toEqual([[[17.4, 121.7], [17.4003, 121.7], [17.4006, 121.7]]])
  expect(JSON.stringify(samples)).toBe(original)
})

it('does not connect across a low-accuracy sample or a long gap', () => {
  const trace = buildReportRouteTrace([point(0, 17.4), point(60, 17.4003), point(120, 17.41, { accuracy: 150 }),
    point(180, 17.4006), point(240, 17.4009), point(900, 17.4012), point(960, 17.4015)])
  expect(trace.omitted).toBe(1)
  expect(trace.segments).toHaveLength(3)
  expect(trace.segments.every(segment => segment.length === 2)).toBe(true)
})

it('does not draw a teleport, fabricated connection, or path from missing timestamps', () => {
  expect(buildReportRouteTrace([point(0, 17.4), point(1, 18.4), point(2, 17.4)]).segments).toEqual([])
  expect(buildReportRouteTrace([point(0, 17.4), point(0, 17.401)]).segments).toEqual([])
  expect(buildReportRouteTrace([{ latitude: 17.4, longitude: 121.7 }, point(0, 17.401)]).segments).toEqual([])
  expect(buildReportRouteTrace([point(0, 17.4, { latitude: null }), point(60, 17.4003)]).omitted).toBe(1)
})

it('reports unknown accuracy honestly and leaves believable turns intact', () => {
  const trace = buildReportRouteTrace([point(0, 17.4, { accuracy: null }), point(60, 17.4003, { accuracy: null }),
    point(120, 17.4006, { longitude: 121.7005, accuracy: null })])
  expect(trace.unknownAccuracy).toBe(3)
  expect(trace.segments[0]).toHaveLength(3)
})

it('does not turn zero-speed local GPS wander into a zigzag route', () => {
  const trace = buildReportRouteTrace([point(0, 17.4, { speed: 0, accuracy: null }),
    point(60, 17.4002, { speed: 0, accuracy: null }), point(120, 17.3998, { speed: 0, accuracy: null })])
  expect(trace.simplified).toBe(2)
  expect(trace.segments).toEqual([])
})

it('does not bridge an invalid fix or a gap with several missing updates', () => {
  const trace = buildReportRouteTrace([point(0, 17.4), point(10, 17.4003),
    point(20, 17.4006, { position_valid: false }), point(30, 17.4009), point(40, 17.4012),
    point(110, 17.4015), point(120, 17.4018)])
  expect(trace.omitted).toBe(1)
  expect(trace.segments).toHaveLength(3)
  expect(trace.segments.every(segment => segment.length === 2)).toBe(true)
})
