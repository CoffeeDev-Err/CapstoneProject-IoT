import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MapPersonnelToolbar from './MapPersonnelToolbar'
afterEach(cleanup)
it('finds deployed officers including stale GPS, excludes off-duty officers, and opens announcements', () => {
  const personnel = [{ id: 'P1', name: 'Ana Santos', badge: '10-1001', status: 'On Duty', isOnDuty: true,
    isVisibleOnMap: true, isLocationStale: true, locationAgeSeconds: 600 },
    { id: 'P2', name: 'Ana Reyes', badge: '10-1002', isOnDuty: false },
    { id: 'mock', name: 'Ana mock', isOnDuty: true, isMockPersonnel: true }]
  const select = vi.fn(), announce = vi.fn()
  render(<MapPersonnelToolbar personnel={personnel} onSelectPersonnel={select} onAnnounce={announce} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '10-1001' } })
  expect(screen.queryByText('No visible map marker · Open details')).toBeNull()
  fireEvent.click(screen.getByText('Ana Santos'))
  expect(select).toHaveBeenCalledWith(personnel[0])
  expect(screen.getByRole('searchbox').value).toBe('')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ana' } })
  expect(screen.getByText('Ana Santos')).toBeTruthy()
  expect(screen.queryByText('Ana Reyes')).toBeNull()
  expect(screen.queryByText('Ana mock')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Send announcement' }))
  expect(announce).toHaveBeenCalledTimes(1)
})

it('keeps deployed officers without a GPS position searchable for details', () => {
  const member = { id: 'P3', name: 'Ana Cruz', isOnDuty: true, isVisibleOnMap: false }
  const select = vi.fn()
  render(<MapPersonnelToolbar personnel={[member]} onSelectPersonnel={select} onAnnounce={vi.fn()} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'P3' } })
  expect(screen.getByText('No visible map marker · Open details')).toBeTruthy()
  fireEvent.click(screen.getByText('Ana Cruz'))
  expect(select).toHaveBeenCalledWith(member)
})

it('removes a search result when its deployment ends without changing the shared list', () => {
  const personnel = [{ id: 'P1', name: 'Ana Santos', isOnDuty: true }]
  const props = { onSelectPersonnel: vi.fn(), onAnnounce: vi.fn() }
  const { rerender } = render(<MapPersonnelToolbar {...props} personnel={personnel} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ana' } })
  expect(screen.getByText('Ana Santos')).toBeTruthy()
  rerender(<MapPersonnelToolbar {...props} personnel={[{ ...personnel[0], isOnDuty: false }]} />)
  expect(screen.queryByText('Ana Santos')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('No matching deployed personnel.')
  expect(personnel).toHaveLength(1)
  expect(personnel[0].isOnDuty).toBe(true)
})
