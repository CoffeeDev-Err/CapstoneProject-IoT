import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageCacheProvider } from '../../context/PageCacheProvider'
import { getReportsList } from '../../services/operations'
import { useReportsPageState } from './useReportsPageState'

vi.mock('../../services/operations', () => ({
  getReportsList: vi.fn(), updateReportValidation: vi.fn(),
}))

const refreshReports = vi.fn()
const showFeedback = vi.fn()
function Probe({ revision = 0 }) {
  const state = useReportsPageState({ refreshReports, showFeedback, reportsRevision: revision })
  return <>
    <button onClick={() => state.updateReportTypeFilter('incident')}>Incident</button>
    <button onClick={() => state.updateReportTypeFilter('all')}>All</button>
    <output data-testid="result">{JSON.stringify({
    loading: state.isReportsLoading, rows: state.reports, error: state.reportsError,
  })}</output></>
}
function Page({ active = true, session = 'one', revision = 0 }) {
  return <PageCacheProvider key={session}>{active && <Probe revision={revision} />}</PageCacheProvider>
}
const read = () => JSON.parse(screen.getByTestId('result').textContent)
const payload = (id) => ({ data: id ? [{ id }] : [], pagination: { total: id ? 1 : 0 } })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('reports navigation cache', () => {
  it('shows a first-load skeleton, then cached rows on return while refreshing', async () => {
    const first = deferred()
    const next = deferred()
    getReportsList.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise)
    const page = render(<Page />)
    expect(read().loading).toBe(true)
    await act(async () => first.resolve(payload('old')))
    expect(read()).toEqual({ loading: false, rows: [{ id: 'old' }], error: '' })
    page.rerender(<Page active={false} />)
    page.rerender(<Page />)
    expect(getReportsList).toHaveBeenCalledTimes(2)
    expect(read().loading).toBe(false)
    expect(read().rows).toEqual([{ id: 'old' }])
    await act(async () => next.resolve(payload('new')))
    expect(read().rows).toEqual([{ id: 'new' }])
  })

  it('keeps cached rows and exposes a background-refresh error', async () => {
    getReportsList.mockResolvedValueOnce(payload('saved')).mockRejectedValueOnce(new Error('Offline'))
    const page = render(<Page />)
    await waitFor(() => expect(read().rows).toEqual([{ id: 'saved' }]))
    page.rerender(<Page revision={1} />)
    expect(read().loading).toBe(false)
    await waitFor(() => expect(read().error).toBe('Offline'))
    expect(read().rows).toEqual([{ id: 'saved' }])
  })

  it('caches successful empty results but not failures', async () => {
    getReportsList.mockRejectedValueOnce(new Error('Unavailable'))
    const page = render(<Page />)
    await waitFor(() => expect(read().error).toBe('Unavailable'))
    page.rerender(<Page active={false} />)
    const retry = deferred()
    getReportsList.mockReturnValueOnce(retry.promise)
    page.rerender(<Page />)
    expect(read().loading).toBe(true)
    await act(async () => retry.resolve(payload()))
    page.rerender(<Page active={false} />)
    getReportsList.mockReturnValueOnce(new Promise(() => {}))
    page.rerender(<Page />)
    expect(read()).toEqual({ loading: false, rows: [], error: '' })
  })

  it('isolates filter results and ignores a late response for a previous query', async () => {
    getReportsList.mockResolvedValueOnce(payload('all'))
    render(<Page />)
    await waitFor(() => expect(read().rows).toEqual([{ id: 'all' }]))
    const incident = deferred()
    getReportsList.mockReturnValueOnce(incident.promise)
    fireEvent.click(screen.getByText('Incident'))
    expect(read()).toEqual({ loading: true, rows: [], error: '' })
    getReportsList.mockReturnValueOnce(new Promise(() => {}))
    fireEvent.click(screen.getByText('All'))
    expect(read()).toEqual({ loading: false, rows: [{ id: 'all' }], error: '' })
    await act(async () => incident.resolve(payload('incident')))
    expect(read().rows).toEqual([{ id: 'all' }])
  })

  it('does not reuse another authenticated session data', async () => {
    getReportsList.mockResolvedValueOnce(payload('private'))
    const page = render(<Page />)
    await waitFor(() => expect(read().rows).toEqual([{ id: 'private' }]))
    getReportsList.mockReturnValueOnce(new Promise(() => {}))
    page.rerender(<Page session="two" />)
    expect(read()).toEqual({ loading: true, rows: [], error: '' })
  })
})
