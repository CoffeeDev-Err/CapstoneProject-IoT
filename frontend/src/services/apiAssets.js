import { API_URL } from './runtime'

export const resolveApiAssetUrl = (assetUrl) => {
  if (!assetUrl) return ''
  if (/^(https?:|data:|blob:)/i.test(assetUrl)) return assetUrl
  return `${API_URL}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`
}
