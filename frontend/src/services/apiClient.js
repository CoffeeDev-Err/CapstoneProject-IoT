import { API_URL } from './runtime'

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
    errorMessage = 'Unable to complete the request.',
    headers: providedHeaders,
    ...fetchOptions
  } = options
  const isMultipart = fetchOptions.body instanceof FormData
  const headers = {
    ...(!isMultipart && fetchOptions.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...providedHeaders,
  }
  let response
  try {
    // The session lives in an httpOnly cookie, so credentials must be sent with
    // every request; there is no bearer token in JavaScript to attach.
    response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      credentials: 'include',
      headers,
    })
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
