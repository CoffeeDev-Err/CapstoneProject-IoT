import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PageCacheContext, createPageCache } from '../../context/pageCache'
import { getDeploymentHistoryPage, getManageableDeployments } from '../../services/operations'
import { useDeploymentData } from './useDeploymentData'
import { useDeploymentListState } from './useDeploymentListState'

vi.mock('../../services/operations', () => ({ getDeploymentHistoryPage: vi.fn(), getManageableDeployments: vi.fn() }))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const payload = (id = 'archive', page = 1, totalPages = 3) => ({ data: id ? [{ id }] : [],
  historyTotal: 30, pagination: { page, limit: 10, total: 30, totalPages } })
function session(cache = createPageCache()) {
  return ({ children }) => <PageCacheContext.Provider value={cache}>{children}</PageCacheContext.Provider>
}
function usePage({ liveDeployments } = {}) {
  const ui = useDeploymentListState()
  const data = useDeploymentData({ ...ui, listOnly: true, liveDeployments })
  return { ...ui, ...data }
}
beforeEach(() => {
  vi.resetAllMocks()
  getManageableDeployments.mockResolvedValue([{ id: 'active', status: 'active' }])
  getDeploymentHistoryPage.mockImplementation(async ({ page }) => payload('page-' + page, page))
})
afterEach(cleanup)

it('caches history pages independently and restores rows while revisiting a page', async () => {
  const second = deferred(), returning = deferred()
  getDeploymentHistoryPage.mockResolvedValueOnce(payload('first')).mockReturnValueOnce(second.promise).mockReturnValueOnce(returning.promise)
  const hook = renderHook(usePage, { wrapper: session() })
  expect(hook.result.current.historyLoading).toBe(true)
  await waitFor(() => expect(hook.result.current.history[0]?.id).toBe('first'))
  act(() => hook.result.current.setHistoryPage(2))
  expect(hook.result.current.history).toEqual([])
  expect(hook.result.current.historyLoading).toBe(true)
  await act(async () => second.resolve(payload('second', 2)))
  act(() => hook.result.current.setHistoryPage(1))
  expect(hook.result.current.history).toEqual([{ id: 'first' }])
  expect(hook.result.current.historyLoading).toBe(false)
  await act(async () => returning.resolve(payload('first refreshed')))
  expect(hook.result.current.history[0].id).toBe('first refreshed')
})

it('does not fetch history when switching active/scheduled tabs and preserves history page and search per tab', async () => {
  const hook = renderHook(usePage, { wrapper: session() })
  await waitFor(() => expect(hook.result.current.hasHistory).toBe(true))
  act(() => hook.result.current.setDeploymentSearch('active search'))
  act(() => hook.result.current.setActiveDeploymentView('scheduled_later'))
  act(() => hook.result.current.setDeploymentSearch('scheduled search'))
  act(() => hook.result.current.setActiveDeploymentView('active_now'))
  expect(hook.result.current.deploymentSearch).toBe('active search')
  expect(getDeploymentHistoryPage).toHaveBeenCalledTimes(1)
  act(() => hook.result.current.setActiveDeploymentView('history'))
  act(() => hook.result.current.setDeploymentSearch('Ana'))
  expect(hook.result.current.history).toEqual([])
  await waitFor(() => expect(getDeploymentHistoryPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Ana' })))
  act(() => hook.result.current.setHistoryPage(2))
  await waitFor(() => expect(hook.result.current.history[0]?.id).toBe('page-2'))
  act(() => hook.result.current.setActiveDeploymentView('active_now'))
  act(() => hook.result.current.setActiveDeploymentView('history'))
  expect(hook.result.current.historyPage).toBe(2)
  expect(hook.result.current.deploymentSearch).toBe('Ana')
})

it('restores the selected tab and history results across navigation but isolates a new session', async () => {
  const wrapper = session()
  const first = renderHook(usePage, { wrapper })
  await waitFor(() => expect(first.result.current.hasHistory).toBe(true))
  act(() => first.result.current.setActiveDeploymentView('history'))
  act(() => first.result.current.setHistoryPage(2))
  await waitFor(() => expect(first.result.current.history[0]?.id).toBe('page-2'))
  first.unmount()
  getDeploymentHistoryPage.mockReturnValue(new Promise(() => {}))
  const returning = renderHook(usePage, { wrapper })
  expect(returning.result.current.activeDeploymentView).toBe('history')
  expect(returning.result.current.historyPage).toBe(2)
  expect(returning.result.current.history).toEqual([{ id: 'page-2' }])
  expect(returning.result.current.historyLoading).toBe(false)
  const nextUser = renderHook(usePage, { wrapper: session() })
  expect(nextUser.result.current.activeDeploymentView).toBe('active_now')
  expect(nextUser.result.current.history).toEqual([])
})

it('refreshes both caches after a lifecycle change and after a live deployment update', async () => {
  const hook = renderHook(usePage, { initialProps: { liveDeployments: [] }, wrapper: session() })
  await waitFor(() => expect(hook.result.current.hasHistory).toBe(true))
  getManageableDeployments.mockResolvedValue([])
  getDeploymentHistoryPage.mockResolvedValue(payload('ended early'))
  act(() => hook.result.current.invalidateDeployments())
  await waitFor(() => expect(hook.result.current.assignments).toEqual([]))
  expect(hook.result.current.history[0].id).toBe('ended early')
  getDeploymentHistoryPage.mockResolvedValue(payload('live change'))
  hook.rerender({ liveDeployments: [{ id: 'new' }] })
  await waitFor(() => expect(hook.result.current.history[0]?.id).toBe('live change'))
})

it('ignores a late history page and retains cached rows on background failure with retry', async () => {
  const old = deferred(), retry = deferred()
  getDeploymentHistoryPage.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payload('second', 2))
  const hook = renderHook(usePage, { wrapper: session() })
  await waitFor(() => expect(getDeploymentHistoryPage).toHaveBeenCalledTimes(1))
  act(() => hook.result.current.setHistoryPage(2))
  await waitFor(() => expect(hook.result.current.history[0]?.id).toBe('second'))
  await act(async () => old.resolve(payload('late first')))
  expect(hook.result.current.history[0].id).toBe('second')
  getDeploymentHistoryPage.mockRejectedValueOnce(new Error('Unavailable')).mockReturnValueOnce(retry.promise)
  act(() => hook.result.current.refreshHistory())
  await waitFor(() => expect(hook.result.current.historyError).toBe('Unavailable'))
  expect(hook.result.current.historyLoading).toBe(false)
  expect(hook.result.current.history[0].id).toBe('second')
  act(() => hook.result.current.refreshHistory())
  await act(async () => retry.resolve(payload('retried', 2)))
  expect(hook.result.current.history[0].id).toBe('retried')
})

it('moves to the last remaining history page when a refresh reduces the page count', async () => {
  const hook = renderHook(usePage, { wrapper: session() })
  await waitFor(() => expect(hook.result.current.hasHistory).toBe(true))
  act(() => hook.result.current.setHistoryPage(3))
  await waitFor(() => expect(hook.result.current.history[0]?.id).toBe('page-3'))
  getDeploymentHistoryPage.mockImplementation(async ({ page }) => payload('remaining', page, 1))
  act(() => hook.result.current.refreshHistory())
  await waitFor(() => expect(hook.result.current.historyPage).toBe(1))
  await waitFor(() => expect(hook.result.current.historyPagination.page).toBe(1))
})

it('does not let stale cached page counts redirect a request before fresh history arrives', async () => {
  const cache = createPageCache(), fresh = deferred()
  cache.write('deployments:list-state', { view: 'history', searches: {}, historyPage: 3, historyLimit: 10 })
  cache.write('deployments:history:[3,10,""]', payload(null, 3, 1))
  getDeploymentHistoryPage.mockReturnValueOnce(fresh.promise)
  const hook = renderHook(usePage, { wrapper: session(cache) })
  expect(hook.result.current.historyPage).toBe(3)
  await act(async () => fresh.resolve(payload('new third page', 3, 3)))
  expect(hook.result.current.historyPage).toBe(3)
  expect(hook.result.current.history[0].id).toBe('new third page')
})
