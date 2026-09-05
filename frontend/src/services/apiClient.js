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
    timeoutMs = options.method && options.method !== 'GET' ? 45_000 : 15_000,
    headers: providedHeaders,
    ...fetchOptions
  } = options
  const isMultipart = fetchOptions.body instanceof FormData
  const headers = {
    ...(!isMultipart && fetchOptions.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...providedHeaders,
  }
  const controller = new AbortController()
  let timer
  let cancel
  const interrupted = new Promise((_resolve, reject) => {
    cancel = () => {
      const error = new Error('Request cancelled.')
      error.name = 'AbortError'
      reject(error)
      controller.abort()
    }
    timer = setTimeout(() => {
      reject(new ApiError('The server took too long to respond. Check your connection and retry.', {
        code: 'REQUEST_TIMEOUT', status: 408,
      }))
      controller.abort()
    }, timeoutMs)
    fetchOptions.signal?.addEventListener('abort', cancel, { once: true })
    if (fetchOptions.signal?.aborted) cancel()
  })
  try {
    // The session lives in an httpOnly cookie, so credentials must be sent with
    // every request; there is no bearer token in JavaScript to attach.
    const { response, payload } = await Promise.race([interrupted, (async () => {
      const response = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        credentials: 'include',
        headers,
      })
      const payload = response.status === 204 ? {} : await response.json().catch(() => {
        if (!response.ok) return {}
        throw new ApiError('The server returned an invalid response. Please retry.', { code: 'INVALID_RESPONSE', status: 502 })
      })
      return { response, payload }
    })()])
    if (!response.ok) {
      throw new ApiError(payload.message || errorMessage, {
        code: payload.code, field: payload.field, status: response.status,
      })
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError || error?.name === 'AbortError') throw error
    throw new ApiError('Unable to connect to the server. Check your connection and try again.', {
      code: 'NETWORK_ERROR',
    })
  } finally {
    clearTimeout(timer)
    fetchOptions.signal?.removeEventListener('abort', cancel)
  }
}
