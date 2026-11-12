import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PatrolPlanner from './PatrolPlanner'
import { apiRequest } from '../../services/apiClient'

vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn() }))
vi.mock('./PatrolMap', () => ({ default: ({ onPoint, blocks, children }) => <div data-testid="patrol-map-data">{JSON.stringify(blocks)}{children}{onPoint && <button type="button" onClick={() => onPoint({ latitude: 17.4305 + (blocks[0]?.routePoints?.length || 0) * 0.0002, longitude: 121.765 })}>Select map point</button>}</div> }))
const personnel = [{ id: 'PNP-1', name: 'Officer One', rank: 'Patrolman' }, { id: 'PNP-2', name: 'Officer Two' }]
const vehicles = [{ id: 'car-1', name: 'Car 1', mode: 'car' }, { id: 'car-2', name: 'Car 2', mode: 'car' }, { id: 'motorcycle-1', name: 'Motorcycle 1', mode: 'motorcycle' }]
const area = { label: 'Market', durationMinutes: 120, offsetMinutes: 0, coverageType: 'custom', latitude: 17.4305, longitude: 121.765, radiusMeters: 200 }
const initial = { id: 'DEP-1', groupId: 'GRP-1', personnelId: 'PNP-1', personnelName: 'Officer One', deploymentType: 'area', shiftStart: '2026-11-13T00:00:00Z', shiftEnd: '2026-11-13T02:00:00Z', scheduleBlocks: [area] }
beforeEach(() => { vi.mocked(apiRequest).mockImplementation(async path => path === '/api/patrol/fleet' ? { vehicles, weeks: [] } : { available: false }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })
const setup = (props = {}) => { const onSave = vi.fn().mockResolvedValue(true); const onCancel = vi.fn(); render(<PatrolPlanner personnel={personnel} assignments={[]} ready onSave={onSave} onCancel={onCancel} {...props} />); return { onSave, onCancel } }
const duty = (end = '2026-11-13T10:00') => { fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-11-13T08:00' } }); fireEvent.change(screen.getByLabelText('End'), { target: { value: end } }) }
const addArea = label => { fireEvent.click(screen.getByRole('button', { name: 'Select map point' })); fireEvent.change(screen.getByLabelText('Area name'), { target: { value: label } }) }
const review = () => fireEvent.click(screen.getByRole('button', { name: 'Review patrol schedule' }))

it('selects two areas without per-area saves, then saves the complete schedule once', async () => {
  const { onSave } = setup(); duty('2026-11-13T12:00')
  expect(screen.queryByRole('button', { name: 'Add next area' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  expect(screen.getByRole('button', { name: 'Go to area 1: Area 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  expect(screen.getByRole('button', { name: 'Go to area 2: Area 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeEnabled()
  review(); expect(screen.getByRole('alert')).toHaveTextContent('Save all selected areas')
  fireEvent.click(screen.getByRole('button', { name: 'Save areas' }))
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeDisabled()
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('Officer One')); review()
  fireEvent.click(screen.getByRole('button', { name: 'Save and deploy' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0][0].scheduleBlocks.map(b => [b.label, b.offsetMinutes, b.durationMinutes])).toEqual([['Area 1', 0, 120], ['Area 2', 120, 120]])
  expect(onSave.mock.calls[0][0][0].scheduleBlocks.every(b => !('autoLabel' in b))).toBe(true)
})

it('navigates numbered areas, edits and removes them, and keeps an explicit location-change mode', async () => {
  setup(); duty('2026-11-13T16:00')
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  expect(screen.getAllByRole('button', { name: /Go to area/ })).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  expect(screen.getAllByRole('button', { name: /Go to area/ })).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Go to area 1: Area 1' }))
  expect(screen.getByLabelText('Area name')).toHaveValue('Area 1')
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Market' } })
  fireEvent.click(screen.getByRole('button', { name: 'Change location' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  expect(screen.getAllByRole('button', { name: /Go to area/ })).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Remove area 1' }))
  expect(screen.getByRole('button', { name: 'Go to area 1: Area 1' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Go to area 4/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeDisabled()
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
})

it('keeps selected areas when correcting overlong duty hours and validates radius before the batch save', async () => {
  setup(); duty('2026-11-13T12:00')
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  duty('2026-11-15T04:00')
  expect(screen.getByRole('alert')).toHaveTextContent('This duty is 44 hours')
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  expect(screen.getAllByRole('button', { name: /Go to area/ })).toHaveLength(1)
  duty('2026-11-13T12:00')
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  fireEvent.change(screen.getByLabelText('Coverage radius (meters)'), { target: { value: '10' } })
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Coverage radius (meters)'), { target: { value: '250' } })
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeEnabled()
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
})

it('adds multiple whole barangays automatically and retains boundary fallback safeguards', async () => {
  setup(); duty('2026-11-13T12:00')
  fireEvent.change(screen.getByLabelText('Add whole barangay'), { target: { value: 'Centro' } })
  fireEvent.change(screen.getByLabelText('Add whole barangay'), { target: { value: 'Ugad' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save areas' })).toBeEnabled())
  expect(screen.getByRole('button', { name: 'Go to area 1: Barangay Centro' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go to area 2: Barangay Ugad' })).toBeInTheDocument()
  expect(screen.getAllByText(/Boundary unavailable/).length).toBeGreaterThan(0)
})

it('saves an area only after review and clears the draft while retaining the saved coverage', async () => {
  const { onSave, onCancel } = setup(); duty(); addArea('Public market'); fireEvent.click(screen.getByRole('button', { name: 'Save areas' }))
  expect(screen.getByLabelText('Area name')).toHaveValue('Public market')
  expect(screen.getByRole('button', { name: /1Public market/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByTestId('patrol-map-data').textContent).toContain('17.4305')
  fireEvent.click(screen.getByLabelText('Officer One')); review()
  expect(screen.getByRole('dialog', { name: 'Review patrol schedule' })).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save and deploy' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ personnelId: 'PNP-1', shiftStart: '2026-11-13T00:00:00.000Z', shiftEnd: '2026-11-13T02:00:00.000Z', deploymentType: 'area', scheduleBlocks: [{ label: 'Public market', durationMinutes: 120, radiusMeters: 200, latitude: 17.4305 }] })
  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Area name')).toHaveValue('')
})

it('edits a foot route and preserves its existing identity and adjustable corridor', async () => {
  const route = { ...initial, deploymentType: 'route', patrolMode: 'walk', scheduleBlocks: [{ ...area, coverageType: 'route', routePoints: [{ latitude: 17.4305, longitude: 121.765 }, { latitude: 17.431, longitude: 121.766 }] }] }
  const { onSave } = setup({ assignments: [route], initialGroup: [route] })
  fireEvent.click(screen.getByRole('button', { name: 'Edit route' }))
  expect(screen.getByLabelText('Route name')).toHaveValue('Market')
  fireEvent.change(screen.getByLabelText('Allowed distance from route (meters, each side)'), { target: { value: '175' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save route' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Save route' })); review()
  fireEvent.click(screen.getByRole('button', { name: 'Save and deploy' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0][0]).toMatchObject({ id: 'DEP-1', groupId: 'GRP-1', scheduleBlocks: [{ routeCorridorMeters: 175 }] })
})

it('rejects unfilled duty and keeps the draft when the selected style is clicked again', async () => {
  const { onSave } = setup(); duty('2026-11-13T12:00')
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Market' } })
  fireEvent.click(screen.getByRole('button', { name: 'Area Patrol' }))
  expect(screen.getByLabelText('Area name')).toHaveValue('Market')
  review()
  expect(screen.getByRole('alert')).toHaveTextContent('fill the full duty exactly')
  expect(onSave).not.toHaveBeenCalled()
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
})

it('reorders compact areas, recomputes their time order, and allows deletion from review', async () => {
  const { onSave } = setup(); duty('2026-11-13T12:00'); addArea('Market'); addArea('Mall')
  expect(screen.getByRole('button', { name: /1Market/ })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: /2Mall/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Move block 2 up' }))
  expect(screen.getByRole('button', { name: /1Mall/ })).toHaveTextContent('8:00 AM'); fireEvent.click(screen.getByRole('button', { name: 'Save areas' }))
  fireEvent.click(screen.getByLabelText('Officer One')); review()
  const dialog = screen.getByRole('dialog', { name: 'Review patrol schedule' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete block 1' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('button', { name: /1Mall/ })).toBeNull()
  review(); expect(screen.getByRole('alert')).toHaveTextContent('Save all selected areas')
  expect(onSave).not.toHaveBeenCalled()
})

it('offers remaining duty duration and blocks an unsaved map draft from review', async () => {
  setup(); duty('2026-11-13T12:00')
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: 'remaining' } })
  expect(screen.getByText('240 minutes selected')).toBeInTheDocument()
  addArea('Full duty market'); fireEvent.click(screen.getByRole('button', { name: 'Save areas' })); fireEvent.click(screen.getByLabelText('Officer One'))
  fireEvent.change(screen.getByLabelText('Area name'), { target: { value: 'Unsaved' } }); review()
  expect(screen.getByRole('alert')).toHaveTextContent('Save all selected areas')
})

it('loads a vehicle crew automatically and never asks for duplicate personnel selection', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ vehicles, weeks: [{ weekStart: '2026-11-09', crews: [{ vehicleId: 'car-1', driverId: 'PNP-1', personnelIds: ['PNP-1', 'PNP-2'] }] }] })
  const route = { ...initial, deploymentType: 'route', patrolMode: 'car', vehicleId: 'car-1', scheduleBlocks: [{ ...area, coverageType: 'route', routePoints: [{ latitude: 17.4305, longitude: 121.765 }, { latitude: 17.431, longitude: 121.766 }] }] }
  const { onSave } = setup({ assignments: [route], initialGroup: [route] })
  await screen.findByText('Locked weekly crew')
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByText('Driver')).toBeInTheDocument()
  review(); fireEvent.click(screen.getByRole('button', { name: 'Save and deploy' }))
  await waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(onSave.mock.calls[0][0].map(a => a.personnelId)).toEqual(['PNP-1', 'PNP-2'])
  expect(onSave.mock.calls[0][0].every(a => a.vehicleId === 'car-1')).toBe(true)
})

it('prevents deployment without a locked vehicle crew and opens the crew manager on demand', async () => {
  setup(); duty(); fireEvent.click(screen.getByRole('button', { name: 'Route Patrol' })); fireEvent.click(screen.getByRole('button', { name: 'Car Patrol' }))
  await screen.findByRole('option', { name: 'Car 1' }); fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: 'car-1' } })
  expect(screen.getByRole('button', { name: 'Review patrol schedule' })).toBeDisabled()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Set up weekly crew' }))
  expect(screen.getByRole('dialog', { name: 'Weekly vehicle crews' })).toBeInTheDocument()
})

it('builds and clears a foot route while retaining saved points in their new order', async () => {
  const { onSave } = setup(); duty(); fireEvent.click(screen.getByRole('button', { name: 'Route Patrol' }))
  fireEvent.change(screen.getByLabelText('Route name'), { target: { value: 'Market walkway' } })
  fireEvent.click(screen.getByRole('button', { name: 'Select map point' })); fireEvent.click(screen.getByRole('button', { name: 'Select map point' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move route point 2 up' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save route' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Save route' }))
  expect(screen.getByLabelText('Route name')).toHaveValue('')
  expect(screen.queryByRole('button', { name: 'Remove route point 1' })).toBeNull()
  fireEvent.click(screen.getByLabelText('Officer One')); review(); fireEvent.click(screen.getByRole('button', { name: 'Save and deploy' }))
  await waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(onSave.mock.calls[0][0][0].scheduleBlocks[0].routePoints[0].latitude).toBeCloseTo(17.4307)
})
