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
  expect(screen.getByText('Officer current GPS')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Validate report' })).not.toBeDisabled()
  await screen.findByText('Report map')
})

it('shows the linked backup request and the actual response team', async () => {
  render(<ReportDetailDrawer report={{
    id: 'RPT-BACKUP', title: 'Backup response report', description: 'Assistance completed.',
    officer: 'Officer One', report_type: 'incident', is_incident: true, severity: 4, validation_status: 'pending',
    case_status: 'open', date_time: '2026-09-09T10:00:00Z', occurred_at: '2026-09-09T09:30:00Z',
    assigned_area: 'Catabayungan', barangay: 'Catabayungan', location: 'Public Market', latitude: 17.4305, longitude: 121.765,
    location_source: 'backup_request',
    backup_response: {
      task_id: 'TSK-2026-BACKUP1', requested_at: '2026-09-09T09:25:00Z', completed_at: '2026-09-09T09:40:00Z',
      request_location: 'Catabayungan Public Market',
      responders: [{
        personnel_id: 'PNP-002', name: 'Responder Two', rank: 'Police Corporal', badge_number: '12002',
        accepted_at: '2026-09-09T09:27:00Z',
      }],
    },
  }} formatDateTime={(value) => value} onClose={vi.fn()} onValidationChange={vi.fn()} onDownload={vi.fn()} />)

  expect(screen.getByText('GPS recorded with backup request')).toBeTruthy()
  expect(screen.getByText('TSK-2026-BACKUP1')).toBeTruthy()
  expect(screen.getByText(/Police Corporal Responder Two/)).toBeTruthy()
  expect(screen.getByText(/Badge 12002/)).toBeTruthy()
  await screen.findByText('Report map')
})

it('shows original and append-only corrected evidence separately', async () => {
  render(<ReportDetailDrawer report={{
    id: 'RPT-EVIDENCE', title: 'Evidence correction', description: 'Corrected evidence attached.',
    officer: 'Officer One', report_type: 'incident', is_incident: true, severity: 3, validation_status: 'pending',
    case_status: 'open', date_time: '2026-09-14T10:00:00Z', occurred_at: '2026-09-14T09:30:00Z',
    assigned_area: 'Catabayungan', barangay: 'Catabayungan', location: 'Public Market', latitude: 17.4305, longitude: 121.765,
    location_source: 'manual',
    evidence_photo: { url: '/original.jpg', camera_facing: 'back', captured_at: '2026-09-14T09:35:00Z' },
    evidence_corrections: [{
      url: '/corrected.jpg', camera_facing: 'front', captured_at: '2026-09-14T10:05:00Z',
      added_at: '2026-09-14T10:06:00Z', added_by_name: 'Officer One', reason: 'Wrong entrance shown', revision: 2,
    }],
  }} formatDateTime={(value) => value} onClose={vi.fn()} onValidationChange={vi.fn()} onDownload={vi.fn()} />)

  expect(screen.getByText('Original evidence')).toBeTruthy()
  expect(screen.getByText('Corrected evidence 1')).toBeTruthy()
  expect(screen.getByText('Reason: Wrong entrance shown')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open corrected evidence 1 viewer for RPT-EVIDENCE' }))
    .toHaveAttribute('href', '/reports/RPT-EVIDENCE/evidence?correction=0')
})
