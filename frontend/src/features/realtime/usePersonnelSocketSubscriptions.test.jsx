import { useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { getPersonnel } from '../../services/personnel'
import { socket } from '../../services/socket'
import { usePersonnelSocketSubscriptions } from './usePersonnelSocketSubscriptions'

vi.mock('../../services/personnel', () => ({ getPersonnel: vi.fn() }))
vi.mock('../../services/operations', () => ({
  getDeployments: vi.fn(async () => []), getReports: vi.fn(async () => []), getTasks: vi.fn(async () => []),
}))
vi.mock('../../services/socket', () => ({ socket: {
  connected: true, connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn(),
} }))

const options = () => ({
  addNotification: vi.fn(), initialLoadVersion: 0, isAuthenticated: true,
  outsidePersonnelIdsRef: { current: new Set() }, setDeployments: vi.fn(),
  setInitialDataError: vi.fn(), setIsInitialDataLoading: vi.fn(), setLastPersonnelSyncAt: vi.fn(),
  setOperationalAlert: vi.fn(), setReports: vi.fn(), setReportsRevision: vi.fn(),
  setStatusMessage: vi.fn(), setTasks: vi.fn(),
})

const reading = (time, latitude = 17.4239) => ({
  id: 'PNP-1', name: 'Officer One', source: 'gps', isOnDuty: true, isVisibleOnMap: true,
  latitude, longitude: 121.7681, locationRecordedAt: new Date(time).toISOString(),
})

beforeEach(() => { vi.clearAllMocks() })

it('keeps a streamed officer visible when a previously started initial fetch returns an empty list', async () => {
  let finishFetch
  getPersonnel.mockImplementationOnce(() => new Promise((resolve) => { finishFetch = resolve }))
  const settings = options()
  const view = renderHook(() => {
    const [personnel, setPersonnel] = useState([])
    usePersonnelSocketSubscriptions({ ...settings, setPersonnel })
    return personnel
  })
  const receive = socket.on.mock.calls.find(([event]) => event === 'personnel:update')[1]
  const latest = reading(Date.now())
  act(() => receive([latest]))
  await act(async () => finishFetch([]))
  expect(view.result.current[0].locationRecordedAt).toBe(latest.locationRecordedAt)
  expect(view.result.current).toHaveLength(1)
})

it('does not regress coordinates when socket snapshots arrive out of order', async () => {
  getPersonnel.mockResolvedValueOnce([])
  const settings = options()
  const view = renderHook(() => {
    const [personnel, setPersonnel] = useState([])
    usePersonnelSocketSubscriptions({ ...settings, setPersonnel })
    return personnel
  })
  await waitFor(() => expect(settings.setIsInitialDataLoading).toHaveBeenLastCalledWith(false))
  const receive = socket.on.mock.calls.find(([event]) => event === 'personnel:update')[1]
  const latest = reading(Date.now() - 2000)
  act(() => receive([latest]))
  act(() => receive([reading(Date.now() - 20_000, 17.42)]))
  expect(view.result.current[0].latitude).toBe(latest.latitude)
  expect(view.result.current[0].locationRecordedAt).toBe(latest.locationRecordedAt)
})
