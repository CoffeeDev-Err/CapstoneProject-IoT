import { interpolateLatLng } from './mapMotion'

// One frame callback for the whole map, rather than one per moving marker.
export const createMapMarkerAnimator = ({
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  clock = () => performance.now(),
} = {}) => {
  const motions = new Map()
  let frame = null
  let lastRenderedAt = -Infinity
  const tick = (now) => {
    frame = null
    if (now - lastRenderedAt >= 1000 / 30) {
      lastRenderedAt = now
      motions.forEach((motion, state) => {
        const progress = Math.min((now - motion.startedAt) / motion.duration, 1)
        state.currentPosition = interpolateLatLng(motion.from, motion.target, progress)
        state.marker?.setLngLat([state.currentPosition[1], state.currentPosition[0]])
        if (progress >= 1) {
          motions.delete(state)
          state.animationFrame = null
        }
      })
    }
    if (motions.size) frame = requestFrame(tick)
  }
  const cancel = (state) => {
    motions.delete(state)
    state.animationFrame = null
    if (!motions.size && frame !== null) {
      cancelFrame(frame)
      frame = null
    }
  }
  return {
    animate(state, from, target, duration) {
      cancel(state)
      motions.set(state, { from: [...from], target: [...target], duration: Math.max(1, duration), startedAt: clock() })
      state.animationFrame = true
      if (frame === null) frame = requestFrame(tick)
    },
    cancel,
    clear() {
      motions.forEach((_, state) => { state.animationFrame = null })
      motions.clear()
      if (frame !== null) cancelFrame(frame)
      frame = null
    },
  }
}
