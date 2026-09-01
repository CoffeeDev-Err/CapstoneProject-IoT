import { Fragment } from 'react'
import { TableSkeletonRows } from '../../components/LoadingSkeleton'
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
  filteredGroupedAssignments,
  isDeploymentsLoading,
  onDeleteAssignment,
  onDeleteGroup,
  onEditAssignment,
  onEditGroup,
  onSearchChange,
  onToggleGroupMenu,
  onViewChange,
  openGroupMenuId,
  visibleAssignments,
}) {
  return (
      <div className="widget-card deployment-list-card slide-up overflow-auto no-scrollbar">
        <div className="assignment-list-header mb-3">
          <h3 className="widget-title mb-0">Assigned Deployment List</h3>
          <input
            type="search"
            className="settings-input assignment-list-search"
            value={deploymentSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search Deployment Information"
          />
        </div>

        <div
          className="deployment-view-nav smooth-underline-control mb-3"
          role="tablist"
          aria-label="Deployment list views"
          style={{ '--smooth-underline-left': activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW ? '25%' : '75%' }}
        >
          <button
            type="button"
            role="tab"
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
            aria-selected={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER}
            aria-controls="deployment-list-panel"
            className={`deployment-view-tab${activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER ? ' deployment-view-tab--active' : ''}`}
            onClick={() => onViewChange(DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER)}
          >
            Scheduled Later
            <span className="deployment-view-count">{deploymentViewCounts.scheduled}</span>
          </button>
        </div>

        <div id="deployment-list-panel" role="tabpanel" className="deployment-list-panel">
          {isDeploymentsLoading ? (
            <table className="personnel-table assignment-list-table table align-middle mb-0" aria-busy="true">
              <thead>
                <tr className="assignment-group-table">
                  <th>Assignment ID</th>
                  <th>Personnel</th>
                  <th>Patrol Area</th>
                  <th>Shift Start</th>
                  <th>Shift End</th>
                  <th>Status</th>
                  <th>Assigned At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeletonRows columns={8} rows={5} label="Loading deployments" />
              </tbody>
            </table>
          ) : assignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">No deployment assignments yet.</p>
          ) : visibleAssignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">
              {activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
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
                    <td colSpan={7} className="assignment-group-cell">
                      <div className="assignment-group-content">
                        <strong className="assignment-group-label">{group.patrolArea}</strong>
                        <small className="assignment-group-meta">
                          {group.assignments.length} personnel assigned in this deployment group
                        </small>
                      </div>
                    </td>
                    <td className="assignment-group-actions-cell">
                      <div className="assignment-group-actions assignment-group-menu">
                        <button
                          type="button"
                          className="assignment-group-menu-trigger"
                          onClick={() => onToggleGroupMenu(group.groupId)}
                          aria-expanded={openGroupMenuId === group.groupId}
                          aria-haspopup="menu"
                        >
                          Group Actions
                        </button>

                        {openGroupMenuId === group.groupId && (
                          <div className="assignment-group-menu-dropdown" role="menu">
                            <button
                              type="button"
                              className="assignment-group-edit-btn"
                              onClick={() => onEditGroup(group.groupId)}
                            >
                              Reassign Group
                            </button>
                            <button
                              type="button"
                              className="assignment-group-delete-btn"
                              onClick={() => onDeleteGroup(group)}
                            >
                              Delete Group
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {group.assignments.map((assignment) => (
                    <tr key={assignment.id} className="personnel-row">
                      <td className="personnel-badge">{assignment.id}</td>
                      <td>
                        <strong className="d-block assignment-personnel-name">{assignment.personnelName}</strong>
                        <small className="assignment-personnel-rank">{assignment.rank}</small>
                      </td>
                      <td>{assignment.patrolArea}</td>
                      <td>{assignment.shiftStart ? formatDateTime(assignment.shiftStart) : '-'}</td>
                      <td>{assignment.shiftEnd ? formatDateTime(assignment.shiftEnd) : '-'}</td>
                      <td>
                        <span className={`deployment-status deployment-status--${assignment.status || 'active'}`}>
                          {formatDeploymentStatus(assignment.status)}
                        </span>
                      </td>
                      <td>{formatDateTime(assignment.assignedAt)}</td>
                      <td className="assignment-actions-cell">
                        <div className="assignment-table-actions">
                          <button
                            type="button"
                            className="assignment-edit-btn"
                            onClick={() => onEditAssignment(assignment)}
                          >
                            Reassign
                          </button>
                          <button
                            type="button"
                            className="assignment-delete-btn"
                            onClick={() => onDeleteAssignment(assignment)}
                          >
                            Delete
                          </button>
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
  )
}

export default DeploymentList
