import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfileModal from './ProfileModal'

afterEach(cleanup)

it('allows locating an on-duty officer at a stale last known position', () => {
  const locate = vi.fn()
  render(<ProfileModal selectedPersonnel={{
    id: 'P-1', name: 'Officer One', locationName: 'GPS location unavailable',
    lastKnownLocationName: 'Last patrol location', isLocationStale: true, isVisibleOnMap: true,
    latitude: 17.42, longitude: 121.77, locationRecordedAt: new Date(Date.now() - 600_000).toISOString(),
  }} onClose={vi.fn()} onLocate={locate} />)
  expect(screen.getByText('Last known location')).toBeInTheDocument()
  expect(screen.getByText('Last patrol location')).toBeInTheDocument()
  const button = screen.getByRole('button', { name: 'Locate personnel on map' })
  expect(button).toBeEnabled()
  fireEvent.click(button)
  expect(locate).toHaveBeenCalledOnce()
})

describe('ProfileModal backup context', () => {
  it('shows the request location separately from the officer current location', () => {
    render(<ProfileModal
      selectedPersonnel={{
        id: 'PNP-001',
        name: 'Officer One',
        rank: 'PO1',
        status: 'On Duty',
        locationName: 'Current patrol location',
        isVisibleOnMap: true,
      }}
      selectedTask={{
        id: 'TSK-001',
        type: 'backup',
        title: 'Backup requested',
        status: 'open',
        location: 'Original request point',
        required_responders: 3,
        accepted_by: ['PNP-002'],
        responders: [{
          personnel_id: 'PNP-002',
          name: 'Officer Two',
          accepted_at: '2026-09-13T08:02:00.000Z',
        }],
        created_at: '2026-09-13T08:00:00.000Z',
      }}
      onClose={vi.fn()}
      onLocate={vi.fn()}
      onCompleteTask={vi.fn()}
    />)

    expect(screen.getByText('Current officer location')).toBeInTheDocument()
    expect(screen.getByText('Current patrol location')).toBeInTheDocument()
    expect(screen.getByText('Request location')).toBeInTheDocument()
    expect(screen.getByText('Original request point')).toBeInTheDocument()
    expect(screen.getByText('1 accepted · 0 arrived')).toBeInTheDocument()
    expect(screen.getByText('Responding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waiting for arrival' })).toBeDisabled()
  })
})
