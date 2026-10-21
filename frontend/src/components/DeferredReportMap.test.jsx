import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DeferredReportMap from './DeferredReportMap'
vi.mock('./ReportLocationMap', () => ({ default: () => <div>Visible map</div> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('loads only near the viewport and disconnects its observer', async () => {
  let notify
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { notify = callback }
    observe() {}
    disconnect = disconnect
  })
  render(<DeferredReportMap active incident={{ latitude: 17.4, longitude: 121.7 }} />)
  expect(screen.queryByText('Visible map')).toBeNull()
  act(() => notify([{ isIntersecting: true }]))
  expect(await screen.findByText('Visible map')).toBeTruthy()
  expect(disconnect).toHaveBeenCalled()
})

it('ignores queued observer callbacks after closing before the map becomes visible', () => {
  let notify
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback) { notify = callback }
    observe() {}
    disconnect = disconnect
  })
  const view = render(<DeferredReportMap active />)
  view.rerender(<DeferredReportMap active={false} />)
  act(() => notify([{ isIntersecting: true }]))
  expect(screen.queryByText('Visible map')).toBeNull()
  expect(disconnect).toHaveBeenCalled()
})
