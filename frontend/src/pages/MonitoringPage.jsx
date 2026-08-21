/**
 * MonitoringPage.jsx — Live Map View
 *
 * The primary operational screen for supervisors. Assembled from three
 * child components:
 *   ─ SidePanel    (left) — metrics, status, and clickable officer list
 *   ─ PersonnelMap (center) — full-width MapLibre map with live GPS markers
 *   ─ ProfileModal (overlay) — officer details
 *
 * State:
 *   selectedPersonnel — the officer currently shown in the modal, or null
 *
 * Data flow:
 *   PersonnelContext → hook → this page → props down to child components
 *   User clicks marker/name → setSelectedPersonnel → modal opens
 */
import { useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import ProfileModal from '../components/ProfileModal'
import PersonnelMap from '../components/PersonnelMap'
import SidePanel from '../components/SidePanel'
import { usePersonnelContext } from '../context/usePersonnelContext'

function MonitoringPage() {
  // Pull live officer data and status from the shared context
  const {
    personnel,
    activePersonnel,
    personnelCount,
    statusMessage,
    outOfBoundaryPersonnel,
    stalePersonnel,
    deployments,
    tasks,
  } = usePersonnelContext()

  const mapPersonnel = useMemo(() => {
    const emergencyIds = new Set()
    const operationIds = new Set()
    tasks
      .filter((task) => task.status === 'open' || task.status === 'full')
      .forEach((task) => {
        if (task.type === 'backup') emergencyIds.add(task.requested_by)
        else operationIds.add(task.requested_by)
        const responders = task.accepted_by || []
        responders.forEach((personnelId) => operationIds.add(personnelId))
      })

    return activePersonnel.map((member) => ({
      ...member,
      emergencyActive: emergencyIds.has(member.id),
      operationActive: operationIds.has(member.id),
    }))
  }, [activePersonnel, tasks])

  // Track which officer's profile modal is open (null = modal hidden)
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(null)
  const [followedPersonnelId, setFollowedPersonnelId] = useState(null)
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false)
  const [mapLayoutVersion, setMapLayoutVersion] = useState(0)
  const selectedPersonnel = useMemo(
    () => personnel.find((member) => member.id === selectedPersonnelId) || null,
    [personnel, selectedPersonnelId]
  )
  const activeFollowedPersonnelId = mapPersonnel.some(
    (member) => member.id === followedPersonnelId,
  ) ? followedPersonnelId : null
  const effectiveStatusMessage = stalePersonnel.length > 0
    ? `${stalePersonnel.map((member) => member.name).join(', ')} ${stalePersonnel.length === 1 ? 'has' : 'have'} no current GPS fix. Last known positions are hidden.`
    : statusMessage

  const handleSelectPersonnel = (member) => {
    setSelectedPersonnelId(member?.id || null)
  }

  const handleToggleSidePanel = () => {
    setIsSidePanelCollapsed((prev) => !prev)
    setMapLayoutVersion((prev) => prev + 1)
  }

  const handleLocatePersonnel = (member) => {
    if (!member) {
      return
    }

    if (
      member.isLocationStale === true
      || !Number.isFinite(member.latitude)
      || !Number.isFinite(member.longitude)
    ) {
      return
    }

    setFollowedPersonnelId(member.id)

    // Close the modal so the supervisor can immediately see the map focus result.
    setSelectedPersonnelId(null)
  }

  return (
    <div className="monitoring-shell">
      <main className={`dashboard-grid${isSidePanelCollapsed ? ' dashboard-grid--panel-collapsed' : ''}`}>
        <aside className={`side-panel-shell${isSidePanelCollapsed ? ' is-collapsed' : ''}`}>
          <button
            type="button"
            className={`side-panel-collapse-btn${isSidePanelCollapsed ? ' is-collapsed' : ''}`}
            onClick={handleToggleSidePanel}
            aria-label={isSidePanelCollapsed ? 'Expand side panel' : 'Collapse side panel'}
            title={isSidePanelCollapsed ? 'Expand side panel' : 'Collapse side panel'}
          >
            {isSidePanelCollapsed ? (
              <PanelLeftOpen className="side-panel-collapse-icon" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="side-panel-collapse-icon" aria-hidden="true" />
            )}
          </button>

          <SidePanel
            personnel={activePersonnel}
            personnelCount={personnelCount}
            statusMessage={effectiveStatusMessage}
            outOfBoundaryPersonnelCount={outOfBoundaryPersonnel.length}
            stalePersonnelCount={stalePersonnel.length}
            onSelectPersonnel={handleSelectPersonnel}
          />
        </aside>
        <PersonnelMap
          personnel={mapPersonnel}
          deployments={deployments}
          onSelectPersonnel={handleSelectPersonnel}
          followedPersonnelId={activeFollowedPersonnelId}
          onStopFollowing={() => setFollowedPersonnelId(null)}
          layoutVersion={mapLayoutVersion}
        />
      </main>

      <ProfileModal
        selectedPersonnel={selectedPersonnel}
        onClose={() => setSelectedPersonnelId(null)}
        onLocate={() => handleLocatePersonnel(selectedPersonnel)}
      />
    </div>
  )
}

export default MonitoringPage
