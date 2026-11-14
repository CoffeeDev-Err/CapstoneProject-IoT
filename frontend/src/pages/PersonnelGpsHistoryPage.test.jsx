import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PersonnelGpsHistoryPage from './PersonnelGpsHistoryPage'
import { PageCacheProvider } from '../context/PageCacheProvider'

const fixture = vi.hoisted(() => ({ get: vi.fn(), map: null }))
vi.mock('../services/personnel', () => ({ getDutyGpsHistory: (...args) => fixture.get(...args) }))
vi.mock('../components/ReportLocationMap', () => ({ default: props => { fixture.map = props; return <div aria-label="Test history map" /> } }))
const duty = { id: 'D-1', personnelName: 'Officer One', rank: 'Patrolman', badge: 'P-1', deploymentType: 'point', patrolArea: 'School', shiftStart: '2026-11-04T23:00:00Z', shiftEnd: '2026-11-05T07:00:00Z' }
const hours = Array.from({ length: 8 }, (_, hour) => ({ hour, from: new Date(Date.parse(duty.shiftStart) + hour * 3600_000).toISOString(),
  to: new Date(Date.parse(duty.shiftStart) + (hour + 1) * 3600_000).toISOString(), status: hour ? 'no_reading' : 'recorded',
  checkpoint: hour ? null : { latitude: 17.42, longitude: 121.77, recorded_at: '2026-11-04T23:58:00Z', speed: 0, battery_level: 90 } }))
const payload = { personnel: { id: 'P-1', name: 'Officer One', rank: 'Patrolman', badge: 'P-1' }, duty, shifts: [duty], hours, points: [], next_cursor: null }
const open = () => render(<PageCacheProvider><MemoryRouter initialEntries={['/personnel/P-1/gps-history']}><Routes><Route path="/personnel/:personnelId/gps-history" element={<PersonnelGpsHistoryPage />} /></Routes></MemoryRouter></PageCacheProvider>)
beforeEach(() => { fixture.get.mockReset(); fixture.get.mockResolvedValue(payload); fixture.map = null })
afterEach(cleanup)

it('opens hourly dots on the map without an hourly card grid or permanent details panel', async () => {
  open()
  expect(await screen.findByText('Fixed post · School')).toBeTruthy()
  expect(screen.getByText('1 checkpoint · 7 hours without readings')).toBeTruthy()
  expect(fixture.get).toHaveBeenCalledWith(expect.objectContaining({ personnelId: 'P-1', view: 'hourly' }))
  await waitFor(() => expect(fixture.map?.hourlyCheckpoints).toHaveLength(8))
  expect(screen.queryByText('Hourly records')).toBeNull()
  expect(screen.queryByRole('region', { name: 'Selected hourly checkpoint details' })).toBeNull()
  expect(fixture.map.hourlyCheckpoints[0].checkpoint.recorded_at).toBe('2026-11-04T23:58:00Z')
  expect(fixture.map.historyContext.personnelName).toBe('Officer One')
  expect(fixture.get).toHaveBeenCalledTimes(1)
})
it('loads every detailed page before drawing and allows detailed history for fixed posts', async () => {
  open()
  await screen.findByText('Fixed post · School')
  const firstPoint = { latitude: 17.42, longitude: 121.77, recorded_at: hours[0].from }
  const nextPoint = { ...firstPoint, recorded_at: hours[0].to }
  fixture.get.mockImplementation(async query => query.cursor ? { ...payload, points: [nextPoint] } : { ...payload, points: [firstPoint], next_cursor: '123' })
  fireEvent.click(screen.getByRole('button', { name: 'Detailed GPS trace' }))
  expect(await screen.findByText('2 GPS readings')).toBeTruthy()
  expect(fixture.get).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '123', deploymentId: 'D-1' }))
  await waitFor(() => expect(fixture.map?.routePoints).toHaveLength(2))
  expect(fixture.map.hourlyCheckpoints).toBeUndefined()
})
it('shows an empty history or request error without drawing an earlier officer trace', async () => {
  fixture.get.mockResolvedValueOnce({ ...payload, duty: null, shifts: [] })
  open()
  expect(await screen.findByText('No duty history for this date')).toBeTruthy()
  fixture.get.mockRejectedValueOnce(new Error('Unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByLabelText('Test history map')).toBeTruthy()
  expect(fixture.map.routePoints).toEqual([])
  expect(fixture.map.hourlyCheckpoints).toBeUndefined()
})
it('filters hourly dots without changing the original data or creating a new GPS reading', async () => {
  open()
  await screen.findByText('Fixed post · School')
  fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '0' } })
  await waitFor(() => expect(fixture.map?.hourlyCheckpoints).toHaveLength(1))
  expect(fixture.map.hourlyCheckpoints[0].checkpoint.battery_level).toBe(90)
  expect(fixture.get).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '1' } })
  expect(await screen.findByText('No GPS readings for this hour')).toBeTruthy()
  expect(fixture.map.hourlyCheckpoints[0].checkpoint).toBeNull()
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

it('restores cached hourly checkpoints immediately while refreshing after a view switch', async () => {
  open()
  await screen.findByText('Fixed post · School')
  fireEvent.click(screen.getByRole('button', { name: 'Detailed GPS trace' }))
  await waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh history' }).disabled).toBe(false))
  let finish
  fixture.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Hourly checkpoints' }))
  expect(screen.queryByText('Loading GPS history…')).toBeNull()
  expect(screen.getByText('1 checkpoint · 7 hours without readings')).toBeTruthy()
  await waitFor(() => expect(fixture.get).toHaveBeenCalledTimes(3))
  expect(fixture.map.hourlyCheckpoints).toHaveLength(8)
  await act(async () => finish(payload))
})

it('keeps cached readings visible and offers retry after a background refresh fails', async () => {
  open()
  await screen.findByText('Fixed post · School')
  fixture.get.mockRejectedValueOnce(new Error('Unavailable'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
  await screen.findByRole('alert')
  expect(fixture.map.hourlyCheckpoints).toHaveLength(8)
  expect(screen.getByText('1 checkpoint · 7 hours without readings')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
})
