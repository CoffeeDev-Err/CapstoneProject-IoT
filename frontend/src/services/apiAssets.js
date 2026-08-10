const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const resolveApiAssetUrl = (assetUrl) => {
  if (!assetUrl) return ''
  if (/^(https?:|data:|blob:)/i.test(assetUrl)) return assetUrl
  return `${API_URL}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`
}
