const MAPTILER_API_BASE = 'https://api.maptiler.com'

export const MAPTILER_WEB_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY?.trim() || ''
export const hasMapTilerWebApiKey = MAPTILER_WEB_API_KEY.length > 0

const styleIdFor = (mode, isDark) => {
  if (mode === 'satellite') return isDark ? 'hybrid-v4-dark' : 'hybrid-v4'
  return isDark ? 'streets-v4-dark' : 'streets-v4'
}

export const getMapTilerWebStyleUrl = (mode, isDark) => (
  `${MAPTILER_API_BASE}/maps/${styleIdFor(mode, isDark)}/style.json?key=${encodeURIComponent(MAPTILER_WEB_API_KEY)}`
)

export const getMapTilerWebTerrainUrl = () => (
  `${MAPTILER_API_BASE}/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(MAPTILER_WEB_API_KEY)}`
)
