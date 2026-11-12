import { Fragment, useState } from 'react'
import { Eye, FileText } from 'lucide-react'
import { TableSkeletonRows } from '../../components/LoadingSkeleton'
import DeploymentInstructionsModal from './DeploymentInstructionsModal'
import PatrolScheduleDialog from './PatrolScheduleDialog'
import '../../styles/patrol-planner.css'
import {
  DEPLOYMENT_LIST_VIEWS,
  formatDateTime,
  formatDeploymentStatus,
} from './deploymentForm'

function DeploymentList({
  activeDeploymentView,
  assignments,
  deploymentSearch,
  deploymentViewCounts,
  historyCount = 0,
  historyError = false,
  onRetryHistory,
  filteredGroupedAssignments,
  highlightedDeploymentId,
  isDeploymentsLoading,
  onDeleteAssignment,
  onDeleteGroup,
  onEditAssignment,
  onEditGroup,
  onSearchChange,
  onViewChange,
  visibleAssignments,
}) {
  const [instructionsAssignment, setInstructionsAssignment] = useState(null)
  const [viewing, setViewing] = useState(null)
  const actionLabel = assignment => assignment.status === 'scheduled' ? 'Cancel deployment' : 'End deployment'
  const canAct = assignment => ['scheduled', 'active'].includes(assignment.status)

  return (
    <>
      <div className="widget-card deployment-list-card patrol-theme slide-up overflow-auto no-scrollbar">
        <div className="assignment-list-header mb-3">
          <h3 className="widget-title mb-0">Assigned Deployment List</h3>
          <input
            type="search"
            className="settings-input assignment-list-search"
            value={deploymentSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Search deployments" placeholder="Search Deployment Information"
          />
        </div>

        <div
          className="deployment-view-nav patrol-list-tabs mb-3"
          role="tablist"
          aria-label="Deployment list views"
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
            const index = tabs.indexOf(event.target)
            if (index < 0) return
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
            tabs[next].focus(); tabs[next].click()
          }}
        >
          <button
            type="button"
            role="tab"
            id="deployment-active-tab"
            tabIndex={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW ? 0 : -1}
            aria-selected={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW}
            aria-controls="deployment-list-panel"
            className={`deployment-view-tab${activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW ? ' deployment-view-tab--active' : ''}`}
            onClick={() => onViewChange(DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)}
          >
            Active Now
            <span className="deployment-view-count">{deploymentViewCounts.active}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="deployment-scheduled-tab"
            tabIndex={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER ? 0 : -1}
            aria-selected={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER}
            aria-controls="deployment-list-panel"
            className={`deployment-view-tab${activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER ? ' deployment-view-tab--active' : ''}`}
            onClick={() => onViewChange(DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER)}
          >
            Scheduled Later
            <span className="deployment-view-count">{deploymentViewCounts.scheduled}</span>
          </button>
          <button type="button" role="tab" id="deployment-history-tab" tabIndex={activeDeploymentView === 'history' ? 0 : -1} aria-selected={activeDeploymentView === 'history'} aria-controls="deployment-list-panel" className={`deployment-view-tab${activeDeploymentView === 'history' ? ' deployment-view-tab--active' : ''}`} onClick={() => onViewChange('history')}>History <span className="deployment-view-count">{historyCount}</span></button>
        </div>

        <div id="deployment-list-panel" role="tabpanel" aria-labelledby={activeDeploymentView === 'history' ? 'deployment-history-tab' : activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER ? 'deployment-scheduled-tab' : 'deployment-active-tab'} className="deployment-list-panel">
          {historyError ? <div className="patrol-notice is-error" role="alert">Deployment history could not be loaded. <button type="button" onClick={onRetryHistory}>Retry history</button></div> : isDeploymentsLoading ? (
            <table className="personnel-table assignment-list-table table align-middle mb-0" aria-busy="true">
              <thead>
                <tr className="assignment-group-table">
                  <th>Assignment ID</th>
                  <th>Personnel</th>
                  <th>Patrol Area</th>
                  <th>Instructions</th>
                  <th>Shift Start</th>
                  <th>Shift End</th>
                  <th>Status</th>
                  <th>Assigned At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeletonRows columns={9} rows={5} label="Loading deployments" />
              </tbody>
            </table>
          ) : assignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">No deployment assignments yet.</p>
          ) : visibleAssignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">
              {activeDeploymentView === 'history' ? 'No completed or cancelled deployments.' : activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
                ? 'No deployments are scheduled for later.'
                : 'No deployments are active now.'}
            </p>
          ) : filteredGroupedAssignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">
              No deployment group matched "{deploymentSearch}".
            </p>
          ) : (
            <table className="personnel-table assignment-list-table table align-middle mb-0">
            <thead>
              <tr className="assignment-group-table">
                <th>Assignment ID</th>
                <th>Personnel</th>
                <th>Patrol Area</th>
                <th>Instructions</th>
                <th>Shift Start</th>
                <th>Shift End</th>
                <th>Status</th>
                <th>Assigned At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroupedAssignments.map((group) => (
                <Fragment key={group.groupId}>
                  <tr className="assignment-group-row">
                    <td colSpan={8} className="assignment-group-cell">
                      <div className="assignment-group-content">
                        <strong className="assignment-group-label">{group.patrolArea}</strong>
                        <small className="assignment-group-meta">
                          {group.assignments.length} personnel assigned in this deployment group
                        </small>
                      </div>
                    </td>
                    <td className="assignment-group-actions-cell">
                      <div className="assignment-group-actions assignment-group-menu">
                        <button type="button" className="assignment-edit-btn" onClick={() => setViewing({ assignment: group.assignments[0], group: group.assignments, groupId: group.groupId })}><Eye size={15} /> View</button>
                        {group.assignments.some(canAct) && <button type="button" className="assignment-delete-btn" onClick={() => onDeleteGroup(group)}>{actionLabel(group.assignments[0])}</button>}
                      </div>
                    </td>
                  </tr>

                  {group.assignments.map((assignment) => (
                    <tr
                      key={assignment.id}
                      data-deployment-id={assignment.id}
                      className={`personnel-row${assignment.id === highlightedDeploymentId ? ' deployment-row--highlighted' : ''}`}
                    >
                      <td data-label="Assignment ID" className="personnel-badge">{assignment.id}</td>
                      <td data-label="Personnel">
                        <strong className="d-block assignment-personnel-name">{assignment.personnelName}</strong>
                        <small className="assignment-personnel-rank">{assignment.rank}</small>
                      </td>
                      <td data-label="Patrol Area">
                        <strong className="d-block assignment-personnel-name">{assignment.patrolArea}</strong>
                        <small className="assignment-personnel-rank">
                          {assignment.deploymentType === 'point'
                            ? `Area patrol${assignment.deploymentPointLabel ? ` · ${assignment.deploymentPointLabel}` : ''}`
                            : assignment.deploymentType === 'route'
                              ? `Route patrol${assignment.patrolMode ? ` · ${{ walk: 'Foot', car: 'Car', motorcycle: 'Motorcycle' }[assignment.patrolMode]}` : ''}` : 'Area patrol'}
                        </small>
                        {assignment.scheduleBlocks?.length > 0 && <details className="assignment-schedule-details">
                          <summary>{assignment.scheduleBlocks.length} scheduled {assignment.deploymentType === 'route' ? 'routes' : 'areas'}</summary>
                          <ol>{assignment.scheduleBlocks.map((block, index) => <li key={index}>
                            <strong>{block.label}</strong><br />
                            {formatDateTime(new Date(Date.parse(assignment.shiftStart) + block.offsetMinutes * 60000).toISOString())}
                            {' · '}{block.durationMinutes} minutes
                            {block.coverageType === 'custom' && ` · ${block.radiusMeters} m radius`}
                            {block.coverageType === 'route' && ` · ${block.routeCorridorMeters ?? 100} m each side`}
                            {block.coverageType === 'route' && (!block.geometry || (assignment.patrolMode !== 'walk' && !block.roadDirections)) && ' · Route warnings unavailable'}
                            {block.coverageType === 'barangay' && !block.geometry && ' · Boundary unavailable'}
                          </li>)}</ol>
                        </details>}
                        {assignment.vehicleId && <small className="d-block">{assignment.vehicleId.replaceAll('-', ' ')}{assignment.vehicleCrew?.driverId === assignment.personnelId ? ' · Driver' : ''}</small>}
                      </td>
                      <td data-label="Instructions" className="assignment-instructions-cell">
                        <button
                          type="button"
                          className="assignment-instructions-btn"
                          onClick={() => setInstructionsAssignment(assignment)}
                          aria-label={`View instructions for ${assignment.personnelName}`}
                          title="View deployment instructions"
                        >
                          <FileText aria-hidden="true" />
                        </button>
                      </td>
                      <td data-label="Shift Start">{assignment.shiftStart ? formatDateTime(assignment.shiftStart) : '-'}</td>
                      <td data-label="Shift End">{assignment.shiftEnd ? formatDateTime(assignment.shiftEnd) : '-'}</td>
                      <td data-label="Status">
                        <span className={`deployment-status deployment-status--${assignment.status || 'active'}`}>
                          {formatDeploymentStatus(assignment.status)}
                        </span>
                      </td>
                      <td data-label="Assigned At">{formatDateTime(assignment.assignedAt)}</td>
                      <td data-label="Actions" className="assignment-actions-cell">
                        <div className="assignment-table-actions">
                          <button type="button" className="assignment-edit-btn" onClick={() => setViewing({ assignment, group: group.assignments, groupId: assignment.vehicleId ? group.groupId : null })}><Eye size={15} /> View</button>
                          {canAct(assignment) && <button type="button" className="assignment-delete-btn" onClick={() => assignment.vehicleId ? onDeleteGroup(group) : onDeleteAssignment(assignment)}>{actionLabel(assignment)}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            </table>
          )}
        </div>
      </div>
      {viewing && <PatrolScheduleDialog assignment={viewing.assignment} group={viewing.group} onClose={() => setViewing(null)} onReassign={() => { const selected = viewing; setViewing(null); if (selected.groupId) onEditGroup(selected.groupId); else onEditAssignment(selected.assignment) }} />}
      <DeploymentInstructionsModal
        assignment={instructionsAssignment}
        onClose={() => setInstructionsAssignment(null)}
      />
    </>
  )
}

export default DeploymentList
