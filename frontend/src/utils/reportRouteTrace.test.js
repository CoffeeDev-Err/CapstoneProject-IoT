import { expect, it } from 'vitest'
import { buildReportRouteTrace, routeBearing, routeDistanceMeters } from './reportRouteTrace'

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

it('marks probable right and left direction changes at recorded samples without inventing a corner', () => {
  const samples = [point(0, 17.4), point(10, 17.4003), point(20, 17.4003, { longitude: 121.7004 })]
  const original = JSON.stringify(samples)
  const turn = buildReportRouteTrace(samples).turns[0]
  expect(turn).toMatchObject({ direction: 'right', angle: 90, latitude: 17.4003, longitude: 121.7,
    recorded_at: samples[1].recorded_at, from: samples[0].recorded_at, to: samples[2].recorded_at })
  expect(turn.incomingDistance).toBeGreaterThan(30)
  expect(turn.outgoingDistance).toBeGreaterThan(40)
  expect(JSON.stringify(samples)).toBe(original)
  samples[2].longitude = 121.6996
  expect(buildReportRouteTrace(samples).turns[0].direction).toBe('left')
})

it('does not mark a turn from uncertainty, stationary drift, or disconnected segments', () => {
  const samples = [point(0, 17.4), point(10, 17.4003), point(20, 17.4003, { longitude: 121.7004 })]
  expect(buildReportRouteTrace(samples.map(sample => ({ ...sample, accuracy: 20 }))).turns).toEqual([])
  expect(buildReportRouteTrace(samples.map(sample => ({ ...sample, speed: 0 }))).turns).toEqual([])
  expect(buildReportRouteTrace([samples[0], { ...samples[1], position_valid: false }, samples[2]]).turns).toEqual([])
  expect(buildReportRouteTrace([samples[0], samples[1], { ...samples[2], recorded_at: point(100, 0).recorded_at }]).turns).toEqual([])
})

it('handles north-bearing wraparound and reports reversals as probable changes', () => {
  const samples = [point(0, 17.4, { longitude: 121.70004 }), point(10, 17.4004), point(20, 17.4008, { longitude: 121.70004 })]
  expect(routeBearing(samples[0], samples[1])).toBeGreaterThan(350)
  expect(routeBearing(samples[1], samples[2])).toBeLessThan(10)
  expect(routeDistanceMeters(samples[0], samples[1])).toBeGreaterThan(40)
  expect(buildReportRouteTrace(samples).turns).toEqual([])
  const reversal = buildReportRouteTrace([point(0, 17.4), point(10, 17.4004), point(20, 17.4, { accuracy: null })]).turns[0]
  expect(reversal.direction).toBe('reversal')
  expect(reversal.accuracy_unknown).toBe(true)
})
