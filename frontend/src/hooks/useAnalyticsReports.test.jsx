import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PageCacheContext, createPageCache } from '../context/pageCache'
import { getReportsList } from '../services/operations'
import { useAnalyticsReports } from './useAnalyticsReports'

vi.mock('../services/operations', () => ({ getReportsList: vi.fn() }))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const period = (from) => ({ from, to: '2026-11-14', reportsRevision: 0, retry: 0 })
const payload = (id) => ({ data: id ? [{ id }] : [] })
function session() {
  const cache = createPageCache()
  return ({ children }) => <PageCacheContext.Provider value={cache}>{children}</PageCacheContext.Provider>
}
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

it('isolates periods, immediately restores cached data and ignores aborted responses', async () => {
  const weekly = deferred(), monthly = deferred(), returning = deferred()
  getReportsList.mockReturnValueOnce(weekly.promise).mockReturnValueOnce(monthly.promise).mockReturnValueOnce(returning.promise)
  const hook = renderHook(useAnalyticsReports, { initialProps: period('2026-11-08'), wrapper: session() })
  expect(hook.result.current.hasData).toBe(false)
  await act(async () => weekly.resolve(payload('weekly')))
  hook.rerender(period('2026-11-01'))
  expect(hook.result.current).toMatchObject({ hasData: false, pending: true, reports: [] })
  hook.rerender(period('2026-11-08'))
  expect(hook.result.current).toMatchObject({ hasData: true, pending: true, reports: [{ id: 'weekly' }] })
  expect(getReportsList.mock.calls[1][0].signal.aborted).toBe(true)
  await act(async () => monthly.resolve(payload('late monthly')))
  expect(hook.result.current.reports).toEqual([{ id: 'weekly' }])
  await act(async () => returning.resolve(payload('new weekly')))
  expect(hook.result.current).toMatchObject({ pending: false, reports: [{ id: 'new weekly' }] })
})

it('preserves successful empty results across navigation but starts fresh for a new session', async () => {
  getReportsList.mockResolvedValueOnce(payload())
  const wrapper = session()
  const first = renderHook(useAnalyticsReports, { initialProps: period('2026-11-08'), wrapper })
  await waitFor(() => expect(first.result.current.hasData).toBe(true))
  first.unmount()
  getReportsList.mockReturnValue(new Promise(() => {}))
  const returning = renderHook(useAnalyticsReports, { initialProps: period('2026-11-08'), wrapper })
  expect(returning.result.current).toMatchObject({ hasData: true, pending: true, reports: [] })
  const nextUser = renderHook(useAnalyticsReports, { initialProps: period('2026-11-08'), wrapper: session() })
  expect(nextUser.result.current.hasData).toBe(false)
})

it('refreshes report revisions and retries while retaining cached data after an outage', async () => {
  const changed = deferred(), retry = deferred()
  getReportsList.mockResolvedValueOnce(payload('original')).mockReturnValueOnce(changed.promise).mockReturnValueOnce(retry.promise)
  const hook = renderHook(useAnalyticsReports, { initialProps: period('2026-11-08'), wrapper: session() })
  await waitFor(() => expect(hook.result.current.hasData).toBe(true))
  hook.rerender({ ...period('2026-11-08'), reportsRevision: 1 })
  expect(hook.result.current).toMatchObject({ hasData: true, pending: true, reports: [{ id: 'original' }] })
  await act(async () => changed.reject(new Error('Unavailable')))
  expect(hook.result.current).toMatchObject({ error: 'Unavailable', pending: false, hasData: true })
  hook.rerender({ ...period('2026-11-08'), reportsRevision: 1, retry: 1 })
  expect(hook.result.current.error).toBe('')
  await act(async () => retry.resolve(payload('updated')))
  expect(hook.result.current).toMatchObject({ reports: [{ id: 'updated' }], error: '', pending: false })
})

it('does not cache a failed initial request', async () => {
  getReportsList.mockRejectedValueOnce(new Error('Unavailable'))
  const hook = renderHook(useAnalyticsReports, { initialProps: period('2026-11-08'), wrapper: session() })
  await waitFor(() => expect(hook.result.current.pending).toBe(false))
  expect(hook.result.current).toMatchObject({ hasData: false, error: 'Unavailable' })
})
