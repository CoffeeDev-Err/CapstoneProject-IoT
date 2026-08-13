import { API_URL } from './runtime'
import { AUTH_TOKEN_KEY } from './sessionKeys'

export class ApiError extends Error {
  constructor(message, { code, field, status } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.field = field
    this.status = status
  }
}

export const apiRequest = async (path, options = {}) => {
  const {
    auth = true,
    errorMessage = 'Unable to complete the request.',
    headers: providedHeaders,
    ...fetchOptions
  } = options
  const isMultipart = fetchOptions.body instanceof FormData
  const token = auth ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  const headers = {
    ...(!isMultipart && fetchOptions.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...providedHeaders,
  }
  let response
  try {
    response = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError('Unable to connect to the server. Check your connection and try again.', {
      code: 'NETWORK_ERROR',
    })
  }
  const payload = response.status === 204
    ? {}
    : await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(payload.message || errorMessage, {
      code: payload.code,
      field: payload.field,
      status: response.status,
    })
  }
  return payload
}
