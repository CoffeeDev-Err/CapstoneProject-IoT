import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MapPersonnelToolbar from './MapPersonnelToolbar'
afterEach(cleanup)
it('finds officers by badge or name, keeps off-duty details accessible, and opens announcements', () => {
  const personnel = [{ id: 'P1', name: 'Ana Santos', badge: '10-1001', status: 'Off Duty', isVisibleOnMap: false },
    { id: 'mock', name: 'Ana mock', isMockPersonnel: true }]
  const select = vi.fn(), announce = vi.fn()
  render(<MapPersonnelToolbar personnel={personnel} onSelectPersonnel={select} onAnnounce={announce} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '10-1001' } })
  expect(screen.getByText('No visible map marker · Open details')).toBeTruthy()
  fireEvent.click(screen.getByText('Ana Santos'))
  expect(select).toHaveBeenCalledWith(personnel[0])
  expect(screen.getByRole('searchbox').value).toBe('')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ana' } })
  expect(screen.queryByText('Ana mock')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Send announcement' }))
  expect(announce).toHaveBeenCalledTimes(1)
})
