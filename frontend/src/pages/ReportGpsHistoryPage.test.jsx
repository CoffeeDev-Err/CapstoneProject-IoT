import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import ReportGpsHistoryPage, { ReportGpsHistory } from './ReportGpsHistoryPage'
import { getReport, getReportRoute } from '../services/operations'

vi.mock('../services/operations', () => ({ getReport: vi.fn(), getReportRoute: vi.fn() }))
vi.mock('../components/ReportLocationMap', () => ({ default: ({ routePoints }) => <div>GPS map: {routePoints.length} points</div> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const report = { id: 'RPT-ROUTE', title: 'Checkpoint visit', is_incident: false, latitude: 17.4, longitude: 121.7 }
const sample = { latitude: 17.4, longitude: 121.7, recorded_at: '2026-10-06T06:01:00Z' }
const response = { points: [sample], window: { to: '2026-10-06T06:15:00Z', complete: false },
  road_matching: { available: true, status: 'not_requested', segments: [] } }

it('opens a direct GPS history URL and returns to the same report', async () => {
  getReport.mockResolvedValue(report)
  getReportRoute.mockResolvedValue(response)
  render(<MemoryRouter initialEntries={['/reports/RPT-ROUTE/gps-history']}><Routes>
    <Route path="/reports/:reportId/gps-history" element={<ReportGpsHistoryPage />} />
  </Routes></MemoryRouter>)
  expect(await screen.findByText('GPS map: 1 points')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Back to report' })).toHaveAttribute('href', '/reports?report=RPT-ROUTE')
  expect(getReportRoute).toHaveBeenCalledWith('RPT-ROUTE', expect.objectContaining({ roadMatch: false }))
})

it('keeps raw samples visible and requires vehicle confirmation before road estimation', async () => {
  getReportRoute.mockResolvedValue(response)
  render(<ReportGpsHistory report={report} formatDateTime={value => value} />)
  expect(await screen.findByText('GPS map: 1 points')).toBeTruthy()
  expect(screen.getByText(/Collection window open until/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Estimate road route' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Vehicle travel on roads' }))
  fireEvent.click(screen.getByRole('button', { name: 'Estimate road route' }))
  await waitFor(() => expect(getReportRoute).toHaveBeenCalledWith('RPT-ROUTE', expect.objectContaining({ roadMatch: true })))
  getReportRoute.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh route' }))
  await screen.findByText('offline')
  expect(screen.getByText('GPS map: 1 points')).toBeTruthy()
})

it('aborts an unfinished GPS request when leaving the view', async () => {
  getReportRoute.mockImplementation(() => new Promise(() => {}))
  const view = render(<ReportGpsHistory report={report} />)
  await waitFor(() => expect(getReportRoute).toHaveBeenCalledOnce())
  const signal = getReportRoute.mock.calls[0][1].signal
  view.unmount()
  expect(signal.aborted).toBe(true)
})
