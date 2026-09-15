import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DeploymentList from './DeploymentList'
import { DEPLOYMENT_LIST_VIEWS } from './deploymentForm'

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

const renderList = () => render(
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
  />
)

describe('DeploymentList instructions', () => {
  it('opens the exact assignment instructions from the compact table icon', () => {
    renderList()

    fireEvent.click(screen.getByRole('button', { name: 'View instructions for Officer One' }))

    expect(screen.getByRole('dialog', { name: 'Instructions' })).toBeInTheDocument()
    expect(screen.getByText('Monitor the eastern checkpoint.')).toBeInTheDocument()
    expect(screen.getByText(/Officer One.*Barangay Centro/)).toBeInTheDocument()
  })
})
