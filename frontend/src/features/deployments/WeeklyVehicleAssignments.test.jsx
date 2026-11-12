import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import WeeklyVehicleAssignments from './WeeklyVehicleAssignments'
import { apiRequest } from '../../services/apiClient'
vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const fleet = { vehicles: [{ id: 'car-1', name: 'Car 1' }, { id: 'car-2', name: 'Car 2' }], weeks: [{ weekStart: '2026-11-09', crews: [{ vehicleId: 'car-2', driverId: 'P2', personnelIds: ['P2'] }] }] }
const personnel = [{ id: 'P1', name: 'Leo' }, { id: 'P2', name: 'Mon' }, { id: 'P3', name: 'Ana' }]

it('uses only selected crew in the driver dropdown and posts a single vehicle to lock', async () => {
  vi.mocked(apiRequest).mockResolvedValue({})
  const onSaved = vi.fn().mockResolvedValue(undefined)
  render(<WeeklyVehicleAssignments fleet={fleet} personnel={personnel} initialWeek="2026-11-09" initialVehicle="car-1" onSaved={onSaved} onClose={vi.fn()} />)
  expect(screen.getByLabelText('Mon')).toBeDisabled()
  fireEvent.click(screen.getByLabelText('Leo'))
  const driver = screen.getByLabelText('Driver')
  expect(within(driver).queryByRole('option', { name: 'Ana' })).toBeNull()
  fireEvent.change(driver, { target: { value: 'P1' } }); fireEvent.click(screen.getByRole('button', { name: 'Save and lock weekly crew' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ weekStart: '2026-11-09', crews: [{ vehicleId: 'car-1', driverId: 'P1', personnelIds: ['P1'] }] })
})

it('shows the saved crew as read-only when switching to a locked vehicle', () => {
  render(<WeeklyVehicleAssignments fleet={fleet} personnel={personnel} initialWeek="2026-11-09" initialVehicle="car-1" onSaved={vi.fn()} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: 'car-2' } })
  expect(screen.getByText('Locked for this week')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.queryByLabelText('Driver')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Save and lock weekly crew' })).toBeNull()
})
