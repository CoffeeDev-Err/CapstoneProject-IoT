import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from '../../services/apiClient'
import useRouteDirections from './useRouteDirections'
vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const paths = [[{ latitude: 17.43, longitude: 121.76 }, { latitude: 17.431, longitude: 121.77 }]]
const geometry = { type: 'LineString', coordinates: [[121.76, 17.43], [121.765, 17.432], [121.77, 17.431]] }
it('aborts obsolete directions and ignores a late response for a previously selected mode', async () => {
  const pending = {}
  vi.mocked(apiRequest).mockImplementation((_path, options) => new Promise(resolve => { pending[JSON.parse(options.body).mode] = { resolve, signal: options.signal } }))
  const { result, rerender } = renderHook(({ mode }) => useRouteDirections(paths, mode), { initialProps: { mode: 'walk' } })
  await waitFor(() => expect(pending.walk).toBeDefined())
  rerender({ mode: 'car' })
  expect(pending.walk.signal.aborted).toBe(true)
  await waitFor(() => expect(pending.car).toBeDefined())
  await act(async () => pending.car.resolve({ available: true, geometry }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => pending.walk.resolve({ available: false }))
  expect(result.current.results[0]).toMatchObject({ available: true, geometry })
})
it('makes unavailable directions explicit and allows retry without changing the selected path', async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(Error('Offline')).mockResolvedValueOnce({ available: true, geometry })
  const { result } = renderHook(() => useRouteDirections(paths, 'motorcycle'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.results[0].available).toBe(false)
  act(() => result.current.retry())
  expect(result.current.loading).toBe(true)
  await waitFor(() => expect(result.current.results[0].geometry).toEqual(geometry))
  expect(JSON.parse(vi.mocked(apiRequest).mock.calls[1][1].body)).toEqual({ mode: 'motorcycle', points: paths[0] })
})
