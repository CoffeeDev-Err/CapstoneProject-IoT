import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PageCacheContext, createPageCache } from '../context/pageCache'
import { getDutyGpsHistory } from '../services/personnel'
import { useDutyGpsHistory } from './useDutyGpsHistory'

vi.mock('../services/personnel', () => ({ getDutyGpsHistory: vi.fn() }))
const payload = id => ({ personnel: { id }, duty: { id: 'duty-' + id }, shifts: [], hours: [], points: [{ id: 'point-' + id }], next_cursor: null })
function session() {
  const cache = createPageCache()
  return ({ children }) => <PageCacheContext.Provider value={cache}>{children}</PageCacheContext.Provider>
}
beforeEach(() => {
  vi.resetAllMocks()
  getDutyGpsHistory.mockImplementation(async ({ personnelId }) => payload(personnelId))
})
afterEach(cleanup)

it('restores GPS view/hour preferences across navigation without sharing data between officers', async () => {
  const wrapper = session()
  const first = renderHook(useDutyGpsHistory, { initialProps: 'one', wrapper })
  await waitFor(() => expect(first.result.current.hasData).toBe(true))
  act(() => first.result.current.updateSelection({ view: 'detailed', hour: '2', deploymentId: 'duty-one' }))
  await waitFor(() => expect(first.result.current.loading).toBe(false))
  first.unmount()
  let finish
  getDutyGpsHistory.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const returning = renderHook(useDutyGpsHistory, { initialProps: 'one', wrapper })
  expect(returning.result.current.selection).toMatchObject({ view: 'detailed', hour: '2', deploymentId: 'duty-one' })
  expect(returning.result.current.data.personnel.id).toBe('one')
  await waitFor(() => expect(finish).toBeDefined())
  returning.rerender('two')
  expect(returning.result.current.data).toBeNull()
  expect(returning.result.current.selection.view).toBe('hourly')
  await waitFor(() => expect(returning.result.current.data?.personnel.id).toBe('two'))
  await act(async () => finish(payload('one')))
  expect(returning.result.current.data.personnel.id).toBe('two')
})

it('keeps road matching results separate from recorded GPS data', async () => {
  const hook = renderHook(useDutyGpsHistory, { initialProps: 'one', wrapper: session() })
  await waitFor(() => expect(hook.result.current.hasData).toBe(true))
  act(() => hook.result.current.updateSelection({ view: 'detailed', hour: '0' }))
  await waitFor(() => expect(hook.result.current.hasData).toBe(true))
  getDutyGpsHistory.mockReturnValueOnce(new Promise(() => {}))
  act(() => hook.result.current.updateSelection({ roadMatch: true }))
  expect(hook.result.current.hasData).toBe(false)
  expect(hook.result.current.loading).toBe(true)
  act(() => hook.result.current.updateSelection({ roadMatch: false }))
  expect(hook.result.current.hasData).toBe(true)
  expect(hook.result.current.loading).toBe(false)
})
