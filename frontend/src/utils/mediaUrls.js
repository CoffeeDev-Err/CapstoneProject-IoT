import { API_URL } from '../services/runtime'

export const resolveMediaUrl = (assetUrl) => {
  if (!assetUrl) return ''
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl
  return `${API_URL}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`
}

export const getMediaDownloadUrl = (assetUrl) => {
  const resolvedUrl = resolveMediaUrl(assetUrl)
  if (!resolvedUrl) return ''
  return `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}download=1`
}

export const getEvidenceViewerPath = (reportId, correctionIndex) => {
	const path = `/reports/${encodeURIComponent(reportId)}/evidence`
	return Number.isInteger(correctionIndex) && correctionIndex >= 0
		? `${path}?correction=${correctionIndex}`
		: path
}
