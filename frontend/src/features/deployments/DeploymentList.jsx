import { Fragment, useRef, useState } from 'react'
import { Eye, FileText, Power } from 'lucide-react'
import { TableSkeletonRows } from '../../components/LoadingSkeleton'
import DeploymentInstructionsModal from './DeploymentInstructionsModal'
import PatrolScheduleDialog from './PatrolScheduleDialog'
import PaginationControls from '../../components/PaginationControls'
import { getDeploymentHistoryGroup } from '../../services/operations'
import '../../styles/patrol-planner.css'
import {
  DEPLOYMENT_LIST_VIEWS,
  formatDateTime,
  formatDeploymentStatus,
  resolveGroupId,
} from './deploymentForm'

function DeploymentList({
  activeDeploymentView,
  assignments,
  deploymentSearch,
  deploymentViewCounts,
  historyCount = 0,
  historyPagination,
  onHistoryPageChange,
  onHistoryLimitChange,
  loadError = '',
  hasLoadedData = true,
  onRetryLoad,
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
  const [loadingGroup, setLoadingGroup] = useState(null)
  const [groupError, setGroupError] = useState('')
  const groupRequest = useRef(0)
  const changeView = next => { groupRequest.current += 1; setLoadingGroup(null); setGroupError(''); setViewing(null); onViewChange(next) }
  const actionLabel = assignment => assignment.status === 'scheduled' ? 'Cancel deployment' : 'End deployment'
  const canAct = assignment => ['scheduled', 'active'].includes(assignment.status)
  const rowNumbers = new Map(filteredGroupedAssignments.flatMap(group => group.assignments).map((assignment, index) => [assignment.id, ((historyPagination?.page || 1) - 1) * (historyPagination?.limit || 10) + index + 1]))
  const completeGroup = group => {
    if (activeDeploymentView === 'history') return group
    const members = assignments.filter(assignment => resolveGroupId(assignment) === group.groupId)
    return { ...group, assignments: members.length ? members : group.assignments }
  }
  const viewGroup = async (group, assignment = group.assignments[0]) => {
    if (activeDeploymentView !== 'history') { setViewing({ assignment, group: completeGroup(group).assignments, groupId: group.groupId }); return }
    if (loadingGroup) return
    const request = ++groupRequest.current
    setLoadingGroup(group.groupId); setGroupError('')
    try { const rows = await getDeploymentHistoryGroup(group.groupId); if (request === groupRequest.current) setViewing({ assignment, group: rows.length ? rows : group.assignments, groupId: group.groupId }) }
    catch (error) { if (request === groupRequest.current) setGroupError(error.message) }
    finally { if (request === groupRequest.current) setLoadingGroup(null) }
  }

  return (
    <>
      <div className="widget-card deployment-list-card patrol-theme slide-up overflow-auto no-scrollbar">
        <div className="assignment-list-header mb-3">
          <h3 className="widget-title mb-0">Assigned Deployment List</h3>
          <input
            type="search"
            className="settings-input assignment-list-search"
            value={deploymentSearch}
            onChange={(event) => { groupRequest.current += 1; setLoadingGroup(null); setGroupError(''); onSearchChange(event.target.value) }}
            aria-label="Search deployments" placeholder="Search Deployment Information"
          />
        </div>

        <div
          className="patrol-list-tabs mb-3"
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
            onClick={() => changeView(DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)}
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
            onClick={() => changeView(DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER)}
          >
            Scheduled Later
            <span className="deployment-view-count">{deploymentViewCounts.scheduled}</span>
          </button>
          <button type="button" role="tab" id="deployment-history-tab" tabIndex={activeDeploymentView === 'history' ? 0 : -1} aria-selected={activeDeploymentView === 'history'} aria-controls="deployment-list-panel" className={`deployment-view-tab${activeDeploymentView === 'history' ? ' deployment-view-tab--active' : ''}`} onClick={() => changeView('history')}>History <span className="deployment-view-count">{historyCount}</span></button>
        </div>

        <div id="deployment-list-panel" role="tabpanel" aria-labelledby={activeDeploymentView === 'history' ? 'deployment-history-tab' : activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER ? 'deployment-scheduled-tab' : 'deployment-active-tab'} className="deployment-list-panel">
          {groupError && <p role="alert" className="patrol-notice is-error">{groupError}</p>}
          {loadError && <div className="patrol-notice is-error" role="alert">{activeDeploymentView === 'history' ? 'Deployment history' : 'Deployments'} could not be refreshed. {hasLoadedData && 'Showing previously loaded data. '}<button type="button" onClick={onRetryLoad}>Retry</button></div>}
          {loadError && !hasLoadedData ? null : isDeploymentsLoading ? (
            <table className="personnel-table assignment-list-table table align-middle mb-0" aria-busy="true">
              <thead>
                <tr className="assignment-group-table">
                  {activeDeploymentView === 'history' && <th scope="col">#</th>}
                  <th>Personnel</th>
                  <th>Patrol</th>

                  <th>Duty · PHT</th>

                  <th>Status</th>
                  <th>Assigned At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeletonRows columns={activeDeploymentView === 'history' ? 7 : 6} rows={5} label="Loading deployments" />
              </tbody>
            </table>
          ) : assignments.length === 0 || visibleAssignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">
              {activeDeploymentView === 'history' ? deploymentSearch.trim() ? 'No history records matched your search.' : 'No completed, ended early or cancelled deployments.' : activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
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
                {activeDeploymentView === 'history' && <th scope="col">#</th>}
                <th>Personnel</th>
                <th>Patrol</th>

                <th>Duty · PHT</th>

                <th>Status</th>
                <th>Assigned At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroupedAssignments.map((group) => (
                <Fragment key={group.groupId}>
                  <tr className="assignment-group-row">
                    <td colSpan={activeDeploymentView === 'history' ? 6 : 5} className="assignment-group-cell">
                      <div className="assignment-group-content">
                        <strong className="assignment-group-label">{group.patrolArea}</strong>
                        <small className="assignment-group-meta">
                          {activeDeploymentView === 'history' ? `${group.assignments.length} personnel shown on this page` : `${completeGroup(group).assignments.length} personnel assigned`}{activeDeploymentView !== 'history' && group.assignments.length < completeGroup(group).assignments.length && ` · ${group.assignments.length} match your search`}
                        </small>
                      </div>
                    </td>
                    <td className="assignment-group-actions-cell">
                      <div className="assignment-group-actions assignment-group-menu">
                        <button type="button" className="assignment-edit-btn" disabled={loadingGroup === group.groupId} onClick={() => { void viewGroup(group) }}><Eye size={15} />{loadingGroup === group.groupId ? 'Loading…' : 'View'}</button>
                        {group.assignments.some(canAct) && <button type="button" className="assignment-delete-btn" onClick={() => onDeleteGroup(completeGroup(group))}>{actionLabel(group.assignments[0])}</button>}
                      </div>
                    </td>
                  </tr>

                  {group.assignments.map((assignment) => (
                    <tr
                      key={assignment.id}
                      data-deployment-id={assignment.id}
                      className={`personnel-row${assignment.id === highlightedDeploymentId ? ' deployment-row--highlighted' : ''}`}
                    >
                      {activeDeploymentView === 'history' && <td data-label="#">{rowNumbers.get(assignment.id)}</td>}

                      <td data-label="Personnel">
                        <strong className="d-block assignment-personnel-name">{assignment.personnelName}</strong>
                        <small className="assignment-personnel-rank">{assignment.rank}</small><code className="assignment-compact-id" title={assignment.id}>{assignment.id}</code>
                      </td>
                      <td data-label="Patrol Area">
                        <strong className="d-block assignment-personnel-name">{assignment.patrolArea}</strong>
                        <small className="assignment-personnel-rank">
                          {assignment.deploymentType === 'point'
                            ? `Area patrol${assignment.deploymentPointLabel ? ` · ${assignment.deploymentPointLabel}` : ''}`
                            : assignment.deploymentType === 'route'
                              ? `Route patrol${assignment.patrolMode ? ` · ${{ walk: 'Foot', car: 'Car', motorcycle: 'Motorcycle' }[assignment.patrolMode]}` : ''}` : 'Area patrol'}
                        </small>
                        {assignment.scheduleBlocks?.length > 0 && <small className="assignment-block-count">{assignment.scheduleBlocks.length} {assignment.deploymentType === 'route' ? assignment.scheduleBlocks.length === 1 ? 'route' : 'routes' : assignment.scheduleBlocks.length === 1 ? 'area' : 'areas'}</small>}
                        {assignment.vehicleId && <small className="d-block">{assignment.vehicleId.replaceAll('-', ' ')}{assignment.vehicleCrew?.driverId === assignment.personnelId ? ' · Driver' : ''}</small>}
                      </td>
                      <td data-label="Duty · PHT" className="assignment-duty-cell"><span><small>Start</small>{formatDateTime(assignment.shiftStart)}</span><span><small>End</small>{formatDateTime(assignment.shiftEnd)}</span>{assignment.endedAt && assignment.status === 'ended_early' && <span className="assignment-actual-end"><small>Ended</small>{formatDateTime(assignment.endedAt)}</span>}</td>
                      <td data-label="Status">
                        <span className={`deployment-status deployment-status--${assignment.status || 'active'}`}>
                          {formatDeploymentStatus(assignment.status)}
                        </span>
                      </td>
                      <td data-label="Assigned At" className="assignment-assigned-cell">{formatDateTime(assignment.assignedAt)}</td>
                      <td data-label="Actions" className="assignment-actions-cell">
                        <div className="assignment-table-actions">
                          <button type="button" className="assignment-instructions-btn" onClick={() => setInstructionsAssignment(assignment)} aria-label={`View instructions for ${assignment.personnelName}`} title="View deployment instructions"><FileText size={16} /></button>
                          <button type="button" className="assignment-edit-btn assignment-icon-action" title={`View ${assignment.personnelName}'s deployment`} aria-label={`View deployment for ${assignment.personnelName}`} onClick={() => { if (assignment.vehicleId && activeDeploymentView === 'history') { void viewGroup(group, assignment) } else setViewing({ assignment, group: assignment.vehicleId ? completeGroup(group).assignments : [assignment], groupId: assignment.vehicleId ? group.groupId : null }) }}><Eye size={16} /></button>
                          {!assignment.vehicleId && canAct(assignment) && <button type="button" className="assignment-delete-btn assignment-icon-action" title={`${actionLabel(assignment)} for ${assignment.personnelName}`} aria-label={`${actionLabel(assignment)} for ${assignment.personnelName}`} onClick={() => onDeleteAssignment(assignment)}><Power size={15} /></button>}
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
        {activeDeploymentView === 'history' && historyPagination && hasLoadedData && <PaginationControls label="History records" page={historyPagination.page} limit={historyPagination.limit} total={historyPagination.total} disabled={isDeploymentsLoading || Boolean(loadingGroup)} onPageChange={onHistoryPageChange} onLimitChange={onHistoryLimitChange} />}
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
