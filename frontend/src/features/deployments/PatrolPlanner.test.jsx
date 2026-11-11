import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PatrolPlanner from './PatrolPlanner'
import { apiRequest } from '../../services/apiClient'

vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn() }))
vi.mock('./DeploymentPointModal', () => ({ default: ({ onConfirm }) => <button type="button" onClick={() => onConfirm({ label: 'Market entrance', latitude: 17.4305, longitude: 121.765 })}>Confirm test map point</button> }))
const personnel = [{ id: 'PNP-1', name: 'Officer One' }, { id: 'PNP-2', name: 'Officer Two' }]
beforeEach(() => { vi.mocked(apiRequest).mockResolvedValue({ vehicles: [{ id: 'car-1', name: 'Car 1', mode: 'car' }], weeks: [] }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('creates an area duty with its incident-independent coverage and exact two-hour schedule', async () => {
  const onSave = vi.fn().mockResolvedValue(true)
  render(<PatrolPlanner personnel={personnel} assignments={[]} ready onSave={onSave} onCancel={vi.fn()} />)
  expect(screen.queryByText('Fixed post')).toBeNull()
  fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-11-10T08:00' } })
  fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-11-10T10:00' } })
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Market' } })
  fireEvent.click(screen.getByText('Set coverage on map'))
  fireEvent.click(screen.getByText('Confirm test map point'))
  fireEvent.click(screen.getByLabelText('Officer One'))
  fireEvent.click(screen.getByRole('button', { name: 'Save deployment' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ personnelId: 'PNP-1', shiftStart: '2026-11-10T00:00:00.000Z',
    shiftEnd: '2026-11-10T02:00:00.000Z', deploymentType: 'area', scheduleBlocks: [{ label: 'Market', durationMinutes: 120, radiusMeters: 200 }] })
})

it('blocks a duty with unassigned hours and does not reset entered blocks when reselecting the style', async () => {
  const onSave = vi.fn()
  render(<PatrolPlanner personnel={personnel} assignments={[]} ready onSave={onSave} onCancel={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Market' } })
  fireEvent.click(screen.getByRole('button', { name: 'Area Patrol' }))
  expect(screen.getByLabelText('Area name').value).toBe('Market')
  fireEvent.click(screen.getByLabelText('Officer One'))
  fireEvent.submit(screen.getByRole('button', { name: 'Save deployment' }).closest('form'))
  expect(screen.getByRole('alert').textContent).toContain('fill the full duty exactly')
  expect(onSave).not.toHaveBeenCalled()
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
})
