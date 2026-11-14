import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PageCacheContext, createPageCache } from '../context/pageCache'
import { useCachedRequest } from './useCachedRequest'

function session() {
  const cache = createPageCache()
  return ({ children }) => <PageCacheContext.Provider value={cache}>{children}</PageCacheContext.Provider>
}
afterEach(cleanup)

it('caches successful empty results across mounts and isolates authenticated sessions', async () => {
  const load = vi.fn().mockResolvedValue([]), wrapper = session()
  const first = renderHook(() => useCachedRequest('records', load), { wrapper })
  await waitFor(() => expect(first.result.current.hasData).toBe(true))
  first.unmount()
  load.mockReturnValue(new Promise(() => {}))
  const returning = renderHook(() => useCachedRequest('records', load), { wrapper })
  expect(returning.result.current).toMatchObject({ hasData: true, data: [], pending: true })
  const other = renderHook(() => useCachedRequest('records', load), { wrapper: session() })
  expect(other.result.current).toMatchObject({ hasData: false, data: null })
})

it('does not cache failures and ignores an API response after cancellation', async () => {
  let finish
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockRejectedValueOnce(new Error('Unavailable'))
  const hook = renderHook(({ key }) => useCachedRequest(key, load), { initialProps: { key: 'first' }, wrapper: session() })
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  hook.rerender({ key: 'second' })
  await waitFor(() => expect(hook.result.current.error).toBe('Unavailable'))
  await act(async () => finish(['old']))
  expect(hook.result.current).toMatchObject({ hasData: false, data: null })
  expect(load.mock.calls[0][0].signal.aborted).toBe(true)
})
