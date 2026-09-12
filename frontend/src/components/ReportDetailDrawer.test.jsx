import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ReportDetailDrawer from './ReportDetailDrawer'
vi.mock('./ReportLocationMap', () => ({ default: () => <div>Report map</div> }))
afterEach(cleanup)
it('shows the current report fields without exposing internal report history', async () => {
  render(<ReportDetailDrawer report={{ id: 'RPT-ONE', title: 'Corrected title', description: 'Corrected description',
    officer: 'Officer One', report_type: 'incident', is_incident: true, severity: 3, validation_status: 'pending',
    case_status: 'open', date_time: '2026-09-09T10:00:00Z', occurred_at: '2026-09-08T10:00:00Z',
    assigned_area: 'Catabayungan assignment', barangay: 'Catabayungan', location: 'School entrance', latitude: 17.4305, longitude: 121.765,
    location_source: 'gps', history: [{ at: '2026-09-09T11:00:00Z', by: 'one', name: 'Officer One', kind: 'correction', reason: 'Incorrect landmark',
      changes: [{ field: 'locationName', before: 'Market entrance', after: 'School entrance' }] }],
  }} formatDateTime={(value) => value} onClose={vi.fn()} onValidationChange={vi.fn()} onDownload={vi.fn()} />)
  expect(screen.queryByText('Report history')).toBeNull()
  expect(screen.queryByText('Incorrect landmark')).toBeNull()
  expect(screen.queryByText('Market entrance → School entrance')).toBeNull()
  expect(screen.getByText('2026-09-08T10:00:00Z')).toBeTruthy()
  expect(screen.getByText('Catabayungan assignment')).toBeTruthy()
  expect(screen.getByText('17.430500, 121.765000')).toBeTruthy()
  expect(screen.getByText('GPS suggestion')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Validate report' })).not.toBeDisabled()
  await screen.findByText('Report map')
})
