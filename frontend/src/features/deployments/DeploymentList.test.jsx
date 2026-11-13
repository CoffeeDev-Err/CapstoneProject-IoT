import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeploymentList from './DeploymentList'
import { DEPLOYMENT_LIST_VIEWS } from './deploymentForm'
import { getDeploymentHistoryGroup } from '../../services/operations'
vi.mock('../../services/operations', () => ({ getDeploymentHistoryGroup: vi.fn() }))
vi.mock('./PatrolMap', () => ({ default: ({ onPoint }) => <div data-testid="view-map">{onPoint ? 'Editable' : 'Read-only map'}</div> }))
afterEach(cleanup)

const assignment = {
  id: 'DEP-001',
  personnelName: 'Officer One',
  rank: 'Patrolman',
  patrolArea: 'Barangay Centro',
  notes: 'Monitor the eastern checkpoint.',
  shiftStart: '2026-09-16T00:00:00.000Z',
  shiftEnd: '2026-09-16T08:00:00.000Z',
  assignedAt: '2026-09-15T00:00:00.000Z',
  status: 'scheduled',
}

const renderList = (props = {}) => render(
  <DeploymentList
    activeDeploymentView={DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER}
    assignments={[assignment]}
    deploymentSearch=""
    deploymentViewCounts={{ active: 0, scheduled: 1 }}
    filteredGroupedAssignments={[{
      groupId: 'GROUP-001',
      patrolArea: assignment.patrolArea,
      assignments: [assignment],
    }]}
    highlightedDeploymentId={null}
    isDeploymentsLoading={false}
    onDeleteAssignment={vi.fn()}
    onDeleteGroup={vi.fn()}
    onEditAssignment={vi.fn()}
    onEditGroup={vi.fn()}
    onSearchChange={vi.fn()}
    onToggleGroupMenu={vi.fn()}
    onViewChange={vi.fn()}
    openGroupMenuId={null}
    visibleAssignments={[assignment]}
    {...props}
  />
)

describe('DeploymentList instructions', () => {
  it('loads the full archive group when its members span multiple history pages', async () => {
    vi.mocked(getDeploymentHistoryGroup).mockResolvedValue([{ ...assignment, status: 'completed' }, { ...assignment, id: 'DEP-002', personnelName: 'Officer Two', status: 'completed' }])
    renderList({ activeDeploymentView: 'history', filteredGroupedAssignments: [{ groupId: 'GROUP-001', patrolArea: assignment.patrolArea, assignments: [{ ...assignment, status: 'completed' }] }] })
    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Barangay Centro' })
    expect(within(dialog).getByText('Officer Two')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Reassign/ })).toBeNull()
    expect(getDeploymentHistoryGroup).toHaveBeenCalledWith('GROUP-001')
  })
  it('numbers history records across pages without counting group headings and delegates page changes', () => {
    const onPage = vi.fn(), onLimit = vi.fn()
    renderList({ activeDeploymentView: 'history', historyCount: 106, historyPagination: { page: 2, limit: 10, total: 106 }, onHistoryPageChange: onPage, onHistoryLimitChange: onLimit })
    expect(screen.getByText('11', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByText('11–20 of 106 history records')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'History records page 2' }))
    expect(onPage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'History records next page' }))
    expect(onPage).toHaveBeenCalledWith(3)
    fireEvent.change(screen.getByLabelText('History records per page'), { target: { value: '25' } })
    expect(onLimit).toHaveBeenCalledWith(25)
  })
  it('shows the selected view empty state even when history has existing assignments', () => {
    renderList({ assignments: [], visibleAssignments: [], filteredGroupedAssignments: [], deploymentViewCounts: { active: 0, scheduled: 0 }, historyCount: 98 })
    expect(screen.getByText('No deployments are scheduled for later.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /History 98/ })).toBeInTheDocument()
    expect(screen.queryByText('No deployment assignments yet.')).toBeNull()
  })
  it('moves between deployment views with the arrow keys', () => {
    const onViewChange = vi.fn()
    renderList({ onViewChange })
    fireEvent.keyDown(screen.getByRole('tab', { name: /Scheduled Later/ }), { key: 'ArrowRight' })
    expect(onViewChange).toHaveBeenCalledWith('history')
    expect(screen.getByRole('tab', { name: /History/ })).toHaveFocus()
  })
  it('opens a read-only map and keeps Reassign inside the View dialog', () => {
    renderList()
    expect(screen.queryByRole('button', { name: 'Reassign' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Cancel deployment' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Barangay Centro' })
    expect(within(dialog).getByTestId('view-map')).toHaveTextContent('Read-only map')
    expect(within(dialog).getByRole('button', { name: 'Reassign' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Edit area' })).toBeNull()
  })
  it('opens the exact assignment instructions from the compact table icon', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { name: 'View instructions for Officer One' }))

    expect(screen.getByRole('dialog', { name: 'Instructions' })).toBeInTheDocument()
    expect(screen.getByText('Monitor the eastern checkpoint.')).toBeInTheDocument()
    expect(screen.getByText(/Officer One.*Barangay Centro/)).toBeInTheDocument()
  })
})
