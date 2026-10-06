export const getMapPerformanceOptions = () => ({
  // Keep text crisp while bounding GPU work on high-DPI screens.
  pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 1.5),
  maxTileCacheSize: 256,
})
