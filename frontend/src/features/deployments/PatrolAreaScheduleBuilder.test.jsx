import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import geography from '../../../../contracts/geography/cabagan-geography.json'
import PatrolAreaScheduleBuilder from './PatrolAreaScheduleBuilder'

const map = vi.hoisted(() => ({ point: null, props: null }))
vi.mock('./PatrolMap', () => ({ default: props => {
  map.props = props
  return <div>{props.children}<button type="button" onClick={() => props.onPoint(map.point)}>Tap map</button></div>
} }))
vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn(() => Promise.reject(Error('Offline'))) }))
const feature = name => geography.barangays.features.find(f => f.properties.barangay === name)
const setup = (props = {}) => render(<PatrolAreaScheduleBuilder initialBlocks={[]} start="2026-11-15T08:00" dutyMinutes={480} graceMinutes={10} onGraceChange={vi.fn()} onDirtyChange={vi.fn()} onCommit={vi.fn()} {...props} />)
const tap = name => { map.point = feature(name).properties.center; fireEvent.click(screen.getByRole('button', { name: 'Tap map' })) }
beforeEach(() => { map.point = null; map.props = null })
afterEach(cleanup)

it.each(geography.barangays.features.map(f => f.properties.barangay))('selects and saves the complete %s polygon through a map tap', name => {
  const onCommit = vi.fn()
  setup({ dutyMinutes: 120, onCommit })
  fireEvent.change(screen.getByLabelText('Coverage type'), { target: { value: 'barangay' } })
  expect(map.props.barangayPicker).toBe(true)
  tap(name)
  expect(screen.getByRole('button', { name: `Go to area 1: Barangay ${name}` })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save areas' }))
  expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ barangay: name, geometry: feature(name).geometry, ...feature(name).properties.center, boundarySource: geography.version, durationMinutes: 120 })])
})

it('reports blocked picks and allows a full-duty barangay to be replaced from the map', () => {
  setup()
  fireEvent.change(screen.getByLabelText('Coverage type'), { target: { value: 'barangay' } })
  for (const name of ['Aggub', 'Tallag', 'Ugad', 'Centro']) tap(name)
  tap('Anao')
  expect(screen.getByText(/Duty hours are fully selected/)).toBeInTheDocument()
  expect(map.props.blocks).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Go to area 1: Barangay Aggub' }))
  fireEvent.click(screen.getByRole('button', { name: 'Change barangay' }))
  tap('Anao')
  expect(map.props.blocks.map(b => b.barangay)).toEqual(['Anao', 'Tallag', 'Ugad', 'Centro'])
  expect(map.props.blocks.map(b => b.durationMinutes)).toEqual([120, 120, 120, 120])
  expect(screen.getByRole('button', { name: 'Save areas' })).toBeEnabled()
})

it('gives visible feedback for outside picks and invalid duty hours without adding coverage', () => {
  setup({ dutyError: 'Correct the duty end.' })
  fireEvent.change(screen.getByLabelText('Coverage type'), { target: { value: 'barangay' } })
  map.point = { latitude: 0, longitude: 0 }
  fireEvent.click(screen.getByRole('button', { name: 'Tap map' }))
  expect(screen.getByText('Choose a location inside a Cabagan barangay.')).toBeInTheDocument()
  tap('Aggub')
  expect(screen.getByText('Correct the duty hours above before selecting areas.')).toBeInTheDocument()
  expect(map.props.blocks).toHaveLength(0)
})

it('selects a searched barangay offline and uses the same geometry as a map pick', async () => {
  setup({ dutyMinutes: 120 })
  fireEvent.change(screen.getByLabelText('Coverage type'), { target: { value: 'barangay' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Find a barangay to select' }), { target: { value: 'Aggub' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Barangay Aggub (whole boundary)' }))
  expect(map.props.blocks[0]).toMatchObject({ barangay: 'Aggub', geometry: feature('Aggub').geometry })
  expect(screen.getByText('Whole barangay selected. Its boundary is shown on the map.')).toBeInTheDocument()
})
