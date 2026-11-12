import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeploymentList from './DeploymentList'
import { DEPLOYMENT_LIST_VIEWS } from './deploymentForm'
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
