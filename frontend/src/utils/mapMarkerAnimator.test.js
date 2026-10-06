import { expect, it, vi } from 'vitest'
import { createMapMarkerAnimator } from './mapMarkerAnimator'

it('uses one frame callback for 2,000 moving markers and reaches every confirmed destination', () => {
  let now = 0
  let nextId = 0
  const frames = new Map()
  const animator = createMapMarkerAnimator({
    clock: () => now,
    requestFrame: (callback) => { frames.set(++nextId, callback); return nextId },
    cancelFrame: (id) => frames.delete(id),
  })
  const states = Array.from({ length: 2000 }, () => ({ marker: { setLngLat: vi.fn() }, currentPosition: [17, 121] }))
  states.forEach((state) => animator.animate(state, [17, 121], [18, 122], 250))
  expect(frames.size).toBe(1)
  const flush = (time) => {
    now = time
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(now))
  }
  flush(100)
  expect(frames.size).toBe(1)
  flush(250)
  expect(frames.size).toBe(0)
  states.forEach((state) => {
    expect(state.currentPosition).toEqual([18, 122])
    expect(state.marker.setLngLat).toHaveBeenLastCalledWith([122, 18])
    expect(state.animationFrame).toBeNull()
  })
})

it('cancels hidden markers and replaces outdated motion without moving them afterward', () => {
  let frame
  let now = 0
  const cancelFrame = vi.fn()
  const animator = createMapMarkerAnimator({
    clock: () => now, requestFrame: (callback) => { frame = callback; return 1 }, cancelFrame,
  })
  const hidden = { marker: { setLngLat: vi.fn() }, currentPosition: [17, 121] }
  const followed = { marker: { setLngLat: vi.fn() }, currentPosition: [17, 121] }
  animator.animate(hidden, [17, 121], [18, 122], 250)
  animator.animate(followed, [17, 121], [18, 122], 250)
  animator.cancel(hidden)
  now = 100
  frame(now)
  expect(hidden.marker.setLngLat).not.toHaveBeenCalled()
  animator.animate(followed, followed.currentPosition, [19, 123], 250)
  now = 350
  frame(now)
  expect(followed.currentPosition).toEqual([19, 123])
  animator.animate(followed, [19, 123], [20, 124], 250)
  animator.clear()
  expect(cancelFrame).toHaveBeenCalled()
  expect(followed.animationFrame).toBeNull()
})
