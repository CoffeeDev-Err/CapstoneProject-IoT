/**
 * PersonnelPage.jsx — Officer Roster
 *
 * A tabular view of all registered police officers with their current
 * deployment status. Status badges are coloured using a CSS custom property
 * (--status-color) so each status value maps to a distinct colour.
 *
 * Data source:
 *   Uses live personnel from PersonnelContext (Socket.IO backend stream),
 *   so changing names in backend/src/server.js updates this page automatically.
 */

import { usePersonnelContext } from '../context/usePersonnelContext'

/** Maps normalized duty status strings to badge colours. */
const dutyStatusColor = {
  'On Duty': '#16a34a',
  'Off Duty': '#94a3b8',
}

const getDutyStatus = (status = '') => {
  const normalized = status.trim().toLowerCase()
  return normalized === 'off duty' ? 'Off Duty' : 'On Duty'
}

function PersonnelPage() {
  const { personnel } = usePersonnelContext()

  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header mb-4">
        <h2 className="page-title">Personnel</h2>
        <p className="page-subtitle">Registered officers and current deployment status</p>
      </header>

      <div className="widget-card slide-up overflow-auto no-scrollbar">
        <table className="personnel-table table align-middle mb-0">
          <thead>
            <tr>
              <th>Badge #</th>
              <th>Name</th>
              <th>Rank</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {personnel.map((officer) => {
              const dutyStatus = getDutyStatus(officer.status)

              return (
              <tr key={officer.id} className="personnel-row">
                <td className="personnel-badge">{officer.badge ?? officer.id.toUpperCase()}</td>
                <td>{officer.name}</td>
                <td>{officer.rank}</td>
                <td>
                  <span
                    className="status-badge"
                    style={{ '--status-color': dutyStatusColor[dutyStatus] ?? '#94a3b8' }}
                  >
                    {dutyStatus}
                  </span>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PersonnelPage
