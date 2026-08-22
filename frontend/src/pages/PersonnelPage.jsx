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

import { useDeferredValue, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TableSkeletonRows } from '../components/LoadingSkeleton'
import { usePersonnelContext } from '../context/usePersonnelContext'

/** Maps normalized duty status strings to badge colours. */
const dutyStatusColor = {
  'Backup Requested': '#dc2626',
  'Outside Cabagan': '#d97706',
  'On Operation': '#7c3aed',
  'GPS Stale': '#b45309',
  'On Duty': '#15803d',
  'Off Duty': '#94a3b8',
}

const getDutyStatus = (status = '') => {
  const normalized = status.trim().toLowerCase()
  return normalized === 'off duty' ? 'Off Duty' : 'On Duty'
}

function PersonnelPage() {
  const { personnel, tasks, isInitialDataLoading } = usePersonnelContext()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')

  const roster = useMemo(() => {
    const emergencyIds = new Set()
    const operationIds = new Set()
    tasks
      .filter((task) => task.status === 'open' || task.status === 'full')
      .forEach((task) => {
        if (task.type === 'backup') emergencyIds.add(task.requested_by)
        else operationIds.add(task.requested_by)
        ;(task.accepted_by || []).forEach((id) => operationIds.add(id))
      })

    const query = deferredSearchTerm.trim().toLowerCase()
    return personnel
      .map((officer) => {
        const dutyStatus = getDutyStatus(officer.status)
        let operationalStatus = dutyStatus
        if (emergencyIds.has(officer.id)) operationalStatus = 'Backup Requested'
        else if (officer.isInsideCabagan === false) operationalStatus = 'Outside Cabagan'
        else if (operationIds.has(officer.id)) operationalStatus = 'On Operation'
        else if (officer.isOnDuty === true && officer.isLocationStale) operationalStatus = 'GPS Stale'
        return { ...officer, dutyStatus, operationalStatus }
      })
      .filter((officer) => {
        const matchesQuery = !query || [officer.name, officer.rank, officer.badge, officer.id]
          .some((value) => String(value || '').toLowerCase().includes(query))
        const matchesStatus = statusFilter === 'all'
          || officer.operationalStatus.toLowerCase().replaceAll(' ', '-') === statusFilter
        return matchesQuery && matchesStatus
      })
      .sort((left, right) => {
        if (sortBy === 'status') return left.operationalStatus.localeCompare(right.operationalStatus) || left.name.localeCompare(right.name)
        if (sortBy === 'rank') return left.rank.localeCompare(right.rank) || left.name.localeCompare(right.name)
        return left.name.localeCompare(right.name)
      })
  }, [deferredSearchTerm, personnel, sortBy, statusFilter, tasks])

  const locatePersonnel = (officer) => {
    if (officer.dutyStatus === 'Off Duty' || officer.isLocationStale || officer.isVisibleOnMap === false) return
    navigate('/', { state: { locatePersonnelId: officer.id } })
  }

  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header mb-4">
        <h2 className="page-title">Personnel</h2>
        <p className="page-subtitle">Registered officers and current deployment status</p>
      </header>

      <div className="widget-card slide-up personnel-roster-card">
        <div className="personnel-toolbar">
          <label className="personnel-search">
            <Search aria-hidden="true" />
            <span className="visually-hidden">Search personnel</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, badge, or rank"
            />
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="backup-requested">Backup requested</option>
              <option value="outside-cabagan">Outside Cabagan</option>
              <option value="on-operation">On operation</option>
              <option value="gps-stale">GPS stale</option>
              <option value="on-duty">On duty</option>
              <option value="off-duty">Off duty</option>
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="name">Name</option>
              <option value="rank">Rank</option>
              <option value="status">Status</option>
            </select>
          </label>
          <small>{roster.length} of {personnel.length} personnel</small>
        </div>
        <div className="personnel-table-wrap">
        <table className="personnel-table table align-middle mb-0">
          <thead>
            <tr>
              <th>Badge #</th>
              <th>Name</th>
              <th>Rank</th>
              <th>Status</th>
              <th>Current location</th>
            </tr>
          </thead>
          <tbody>
            {isInitialDataLoading ? (
              <TableSkeletonRows columns={5} rows={6} label="Loading personnel" />
            ) : roster.length === 0 ? (
              <tr><td colSpan={5} className="personnel-empty">No personnel matched the current search and filter.</td></tr>
            ) : roster.map((officer) => {
              const canLocate = officer.dutyStatus !== 'Off Duty'
                && !officer.isLocationStale
                && officer.isVisibleOnMap !== false
              return (
              <tr
                key={officer.id}
                className={`personnel-row${canLocate ? ' is-locatable' : ''}`}
                tabIndex={canLocate ? 0 : undefined}
                aria-label={canLocate ? `Locate ${officer.name} on the live map` : undefined}
                onClick={() => locatePersonnel(officer)}
                onKeyDown={(event) => {
                  if (canLocate && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    locatePersonnel(officer)
                  }
                }}
              >
                <td className="personnel-badge">{officer.badge ?? officer.id.toUpperCase()}</td>
                <td>{officer.name}</td>
                <td>{officer.rank}</td>
                <td>
                  <span
                    className="status-badge"
                    style={{ '--status-color': dutyStatusColor[officer.operationalStatus] ?? '#94a3b8' }}
                  >
                    {officer.operationalStatus}
                  </span>
                </td>
                <td>
                  <span>{officer.locationName || 'Unavailable'}</span>
                  {canLocate && <small className="personnel-locate-hint">Open on live map</small>}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

export default PersonnelPage
