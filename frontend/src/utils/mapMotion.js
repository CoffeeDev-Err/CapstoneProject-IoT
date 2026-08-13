export const MARKER_ANIMATION_DURATION_MS = 700

export const easeOutCubic = (progress) => {
  const constrainedProgress = Math.max(0, Math.min(1, progress))
  return 1 - (1 - constrainedProgress) ** 3
}

export const interpolateLatLng = (from, target, progress) => {
  const eased = easeOutCubic(progress)
  return [
    from[0] + (target[0] - from[0]) * eased,
    from[1] + (target[1] - from[1]) * eased,
  ]
}
