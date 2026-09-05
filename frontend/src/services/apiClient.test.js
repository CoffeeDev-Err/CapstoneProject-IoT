import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('web request deadlines', () => {
  it('bounds a hung response body and aborts the transport', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) })
    const assertion = expect(apiRequest('/api/test')).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 408 })
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps caller cancellation distinct and never retries a write automatically', async () => {
    fetch.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const request = apiRequest('/api/test', { method: 'POST', signal: controller.signal })
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('preserves API error details and session cookies', async () => {
    fetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'Invalid', field: 'email' }) })
    await expect(apiRequest('/api/test')).rejects.toMatchObject({ message: 'Invalid', status: 422, field: 'email' })
    expect(fetch.mock.calls[0][1].credentials).toBe('include')
    expect(vi.getTimerCount()).toBe(0)
  })
})
