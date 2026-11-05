import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PersonnelGpsHistoryPage from './PersonnelGpsHistoryPage'

const fixture = vi.hoisted(() => ({ get: vi.fn(), map: null }))
vi.mock('../services/personnel', () => ({ getDutyGpsHistory: (...args) => fixture.get(...args) }))
vi.mock('../components/ReportLocationMap', () => ({ default: props => { fixture.map = props; return <div aria-label="Test history map" /> } }))
const duty = { id: 'D-1', personnelName: 'Officer One', rank: 'Patrolman', badge: 'P-1', deploymentType: 'point', patrolArea: 'School', shiftStart: '2026-11-04T23:00:00Z', shiftEnd: '2026-11-05T07:00:00Z' }
const hours = Array.from({ length: 8 }, (_, hour) => ({ hour, from: new Date(Date.parse(duty.shiftStart) + hour * 3600_000).toISOString(),
  to: new Date(Date.parse(duty.shiftStart) + (hour + 1) * 3600_000).toISOString(), status: hour ? 'no_reading' : 'recorded',
  checkpoint: hour ? null : { latitude: 17.42, longitude: 121.77, recorded_at: '2026-11-04T23:58:00Z', speed: 0, battery_level: 90 } }))
const payload = { personnel: { id: 'P-1', name: 'Officer One', rank: 'Patrolman', badge: 'P-1' }, duty, shifts: [duty], hours, points: [], next_cursor: null }
const open = () => render(<MemoryRouter initialEntries={['/personnel/P-1/gps-history']}><Routes><Route path="/personnel/:personnelId/gps-history" element={<PersonnelGpsHistoryPage />} /></Routes></MemoryRouter>)
beforeEach(() => { fixture.get.mockReset(); fixture.get.mockResolvedValue(payload); fixture.map = null })
afterEach(cleanup)

it('defaults to hourly history and shows the original reading time and missing hours for an off-duty officer', async () => {
  open()
  expect(await screen.findByText('Fixed post · School')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /No GPS reading/ })).toHaveLength(7)
  expect(fixture.get).toHaveBeenCalledWith(expect.objectContaining({ personnelId: 'P-1', view: 'hourly' }))
  await waitFor(() => expect(fixture.map?.hourlyCheckpoints).toHaveLength(8))
  fireEvent.click(screen.getByRole('button', { name: /^1\. / }))
  expect(screen.getByRole('region', { name: 'Selected hourly checkpoint details' }).textContent).toContain('0 km/h')
  expect(screen.getByRole('region', { name: 'Selected hourly checkpoint details' }).textContent).toContain('90%')
  expect(fixture.get).toHaveBeenCalledTimes(1)
})
it('loads every detailed page before drawing and allows detailed history for fixed posts', async () => {
  open()
  await screen.findByText('Fixed post · School')
  const firstPoint = { latitude: 17.42, longitude: 121.77, recorded_at: hours[0].from }
  const nextPoint = { ...firstPoint, recorded_at: hours[0].to }
  fixture.get.mockImplementation(async query => query.cursor ? { ...payload, points: [nextPoint] } : { ...payload, points: [firstPoint], next_cursor: '123' })
  fireEvent.change(screen.getByLabelText('Display'), { target: { value: 'detailed' } })
  expect(await screen.findByText('2 accepted GPS readings in this selection.')).toBeTruthy()
  expect(fixture.get).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '123', deploymentId: 'D-1' }))
  await waitFor(() => expect(fixture.map?.routePoints).toHaveLength(2))
  expect(fixture.map.hourlyCheckpoints).toBeUndefined()
})
it('shows an empty history or request error without drawing an earlier officer trace', async () => {
  fixture.get.mockResolvedValueOnce({ ...payload, duty: null, shifts: [] })
  open()
  expect(await screen.findByText(/No duty GPS history is available/)).toBeTruthy()
  fixture.get.mockRejectedValueOnce(new Error('Unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByLabelText('Test history map')).toBeNull()
})
it('clears the selected duty and hour when changing dates', async () => {
  open()
  await screen.findByText('Fixed post · School')
  fireEvent.change(screen.getByLabelText('Duty shift'), { target: { value: 'D-1' } })
  await waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(2))
  await screen.findByText('Fixed post · School')
  fireEvent.change(screen.getByLabelText('Date (PHT)'), { target: { value: '2026-11-04' } })
  await waitFor(() => expect(fixture.get).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-11-04', deploymentId: '', hour: '' })))
})
