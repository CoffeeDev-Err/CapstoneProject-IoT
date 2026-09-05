import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PersonnelPage from './PersonnelPage'

const fixture = vi.hoisted(() => ({ context: {}, navigate: vi.fn() }))
vi.mock('../context/usePersonnelContext', () => ({ usePersonnelContext: () => fixture.context }))
vi.mock('../utils/mockPersonnel', () => ({ appendDevelopmentMockPersonnel: (personnel) => personnel }))
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }))

const officer = (overrides = {}) => ({
  id: 'p-001', badge: 'P-1001', name: 'Ana Santos', rank: 'Patrolman', status: 'On Duty',
  isOnDuty: true, isInsideCabagan: true, isLocationStale: false, isVisibleOnMap: true,
  locationName: 'Centro', ...overrides,
})

beforeEach(() => {
  fixture.navigate.mockReset()
  fixture.context = {
    personnel: [officer(), officer({ id: 'p-002', badge: 'P-1002', name: 'Ben Reyes', rank: 'Police Corporal', status: 'Off Duty', isOnDuty: false })],
    tasks: [], isInitialDataLoading: false,
  }
})
afterEach(cleanup)

describe('Personnel roster', () => {
  it('groups officer initials, name, and badge and keeps the five column headings', () => {
    render(<PersonnelPage />)
    const table = screen.getByRole('table', { name: 'Registered personnel' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5)
    const identity = screen.getByText('Ana Santos').closest('td')
    expect(within(identity).getByText('AS')).toBeInTheDocument()
    expect(within(identity).getByText('P-1001')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 matching personnel')).toBeInTheDocument()
  })

  it('keeps search, status filters, and clear filters working', () => {
    render(<PersonnelPage />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search personnel' }), { target: { value: 'P-1002' } })
    expect(screen.getByText('Ben Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Ana Santos')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'on-duty' } })
    expect(screen.getByText('No matching personnel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('2 of 2 matching personnel')).toBeInTheDocument()
  })

  it('sorts by status and rank while retaining the existing name sort', () => {
    render(<PersonnelPage />)
    const getNames = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('strong').textContent)
    expect(getNames()).toEqual(['Ana Santos', 'Ben Reyes'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'status' } })
    expect(getNames()).toEqual(['Ben Reyes', 'Ana Santos'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'rank' } })
    expect(getNames()).toEqual(['Ana Santos', 'Ben Reyes'])
  })

  it('opens the map once and prevents off-duty, stale, and hidden location actions', () => {
    fixture.context.personnel.push(
      officer({ id: 'p-003', name: 'Cora Dela Cruz', isLocationStale: true }),
      officer({ id: 'p-004', name: 'Dan Ramos', isVisibleOnMap: false }),
    )
    render(<PersonnelPage />)
    fireEvent.click(screen.getByRole('button', { name: 'View Ana Santos on live map' }))
    expect(fixture.navigate).toHaveBeenCalledTimes(1)
    expect(fixture.navigate).toHaveBeenCalledWith('/', { state: { locatePersonnelId: 'p-001' } })
    for (const name of ['Ben Reyes', 'Cora Dela Cruz', 'Dan Ramos']) {
      expect(screen.getByRole('button', { name: `View ${name} on live map` })).toBeDisabled()
      fireEvent.click(screen.getByText(name).closest('tr'))
    }
    expect(fixture.navigate).toHaveBeenCalledTimes(1)
  })

  it('preserves backup status precedence and status filtering', () => {
    fixture.context.tasks = [{ type: 'backup', status: 'open', requested_by: 'p-001', accepted_by: [] }]
    render(<PersonnelPage />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'backup-requested' } })
    expect(screen.getByText('Backup Requested')).toBeInTheDocument()
    expect(screen.queryByText('Ben Reyes')).not.toBeInTheDocument()
  })

  it('shows loading instead of an empty roster while the initial request is pending', () => {
    fixture.context = { personnel: [], tasks: [], isInitialDataLoading: true }
    const view = render(<PersonnelPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading personnel')
    expect(screen.queryByText('No registered personnel')).not.toBeInTheDocument()
    fixture.context.isInitialDataLoading = false
    view.rerender(<PersonnelPage />)
    expect(screen.getByText('No registered personnel')).toBeInTheDocument()
  })
})
