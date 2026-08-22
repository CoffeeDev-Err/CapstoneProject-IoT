/**
 * SidePanel.jsx — Live Map Left Column
 *
 * The left panel inside MonitoringPage (the Live Map view).
 * Stacks three information cards vertically:
 *
 *   1. Metric Card  — total count of officers currently being tracked
 *   2. Status Card  — latest Socket.IO / emergency event message
 *   3. List Card    — scrollable roster of active officers;
 *                     clicking a name opens the ProfileModal
 *
 * Props:
 *   personnel         {Array}    — live array of officer objects from the hook
 *   personnelCount    {number}   — pre-derived length (passed in to avoid re-computation)
 *   statusMessage     {string}   — human-readable status from the socket hook
 *   onSelectPersonnel {Function} — called with the officer object when a list item is clicked
 */
function SidePanel({
  personnel,
  personnelCount,
  connectionMessage,
  operationalAlert,
  outOfBoundaryPersonnelCount,
  stalePersonnelCount,
  onSelectPersonnel,
}) {
  return (
    <section className="side-panel h-100">

      {/* ── Metric Card: how many officers are currently on the map ── */}
      <article className="metric-card">
        <h2 className="mb-0 text-uppercase fw-bold small">Personnel on Field</h2>
        <strong className="d-block mt-2">{personnelCount}</strong>
        <small className="text-body-secondary">Units tracked in real-time</small>
      </article>

      {/* ── Status Card: last socket event or connection message ── */}
      <article className="status-card" aria-live="polite">
        <h2 className="mb-0 text-uppercase fw-bold small">System Status</h2>
        <p className="mt-2 mb-0 text-body-secondary">
          {operationalAlert?.message || connectionMessage}
        </p>
        {outOfBoundaryPersonnelCount > 0 && (
          <span className="geofence-alert-pill">
            {outOfBoundaryPersonnelCount} personnel outside Cabagan
          </span>
        )}
        {stalePersonnelCount > 0 && (
          <span className="geofence-alert-pill">
            {stalePersonnelCount} personnel awaiting a current GPS fix
          </span>
        )}
      </article>

      {/* ── List Card: clickable roster of active officers ── */}
      <article className="list-card d-flex flex-column min-vh-0">
        <h2 className="mb-0 text-uppercase fw-bold small">Active Personnel</h2>
        <ul className="mt-3 mb-0 ps-0 list-unstyled d-grid gap-2 overflow-auto">
          {personnel.length === 0 && (
            <li className="personnel-empty-state">
              No active personnel with a current GPS fix.
            </li>
          )}
          {personnel.map((member) => (
            <li key={member.id}>
              {/*
                Each button triggers the ProfileModal for that officer.
                The hover animation (translateX) is handled in CSS.
              */}
              <button
                type="button"
                className="list-item-btn"
                onClick={() => onSelectPersonnel(member)}
              >
                {/* Small circular photo on the left */}
                <InitialsAvatar
                  src={member.photoUrl}
                  name={member.name}
                  alt=""
                  className="officer-list-avatar"
                />
                <div className="list-item-info flex-grow-1 overflow-hidden d-flex flex-column gap-1">
                  <span className="fw-semibold text-truncate">{member.name}</span>
                  <small className="text-body-secondary">{member.rank}</small>
                  {member.isInsideCabagan === false && (
                    <small className="out-of-boundary-label">Outside Cabagan boundary</small>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}

export default SidePanel
import InitialsAvatar from './InitialsAvatar'
