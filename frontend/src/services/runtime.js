const localApiUrl = 'http://localhost:4000'

const normalizeUrl = (value) => String(value || '').replace(/\/$/, '')

export const API_URL = normalizeUrl(
  import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? localApiUrl : window.location.origin),
)

export const SOCKET_URL = normalizeUrl(
  import.meta.env.VITE_SOCKET_URL || API_URL,
)
