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
import { lazy, Suspense, useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { MonitoringContentSkeleton } from '../components/LoadingSkeleton'
import ProfileModal from '../components/ProfileModal'
import SidePanel from '../components/SidePanel'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { useDevelopmentMapPersonnel } from '../hooks/useDevelopmentMapPersonnel'

const PersonnelMap = lazy(() => import('../components/PersonnelMap'))

function MonitoringPage() {
  const location = useLocation()
  // Pull live officer data and status from the shared context
  const {
    personnel,
    activePersonnel,
    personnelCount,
    statusMessage,
    operationalAlert,
    outOfBoundaryPersonnel,
    stalePersonnel,
    deployments,
    tasks,
    isInitialDataLoading,
    initialDataError,
    isConnected,
    lastPersonnelSyncAt,
    retryInitialData,
  } = usePersonnelContext()
  const {
    enabled: isDevelopmentMapPreview,
    personnel: developmentMapPersonnel,
  } = useDevelopmentMapPersonnel(location.search)

  const liveMapPersonnel = useMemo(() => {
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
  const mapPersonnel = useMemo(
    () => [...liveMapPersonnel, ...developmentMapPersonnel],
    [developmentMapPersonnel, liveMapPersonnel],
  )
  const selectablePersonnel = useMemo(
    () => [...personnel, ...developmentMapPersonnel],
    [developmentMapPersonnel, personnel],
  )

  // Track which officer's profile modal is open (null = modal hidden)
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(null)
  const [followedPersonnelId, setFollowedPersonnelId] = useState(
    () => location.state?.locatePersonnelId || null,
  )
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false)
  const [mapLayoutVersion, setMapLayoutVersion] = useState(0)
  const selectedPersonnel = useMemo(
    () => selectablePersonnel.find((member) => member.id === selectedPersonnelId) || null,
    [selectablePersonnel, selectedPersonnelId]
  )
  const activeFollowedPersonnelId = mapPersonnel.some(
    (member) => member.id === followedPersonnelId,
  ) ? followedPersonnelId : null

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

  if (isInitialDataLoading) {
    return (
      <div className="monitoring-shell">
        <MonitoringContentSkeleton />
      </div>
    )
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
            connectionMessage={statusMessage}
            operationalAlert={operationalAlert}
            outOfBoundaryPersonnelCount={outOfBoundaryPersonnel.length}
            stalePersonnelCount={stalePersonnel.length}
            onSelectPersonnel={handleSelectPersonnel}
          />
        </aside>
        <Suspense fallback={<div className="map-panel map-chunk-loading h-100" role="status">Loading live map...</div>}>
          <PersonnelMap
            personnel={mapPersonnel}
            deployments={deployments}
            onSelectPersonnel={handleSelectPersonnel}
            followedPersonnelId={activeFollowedPersonnelId}
            onStopFollowing={() => setFollowedPersonnelId(null)}
            layoutVersion={mapLayoutVersion}
            isConnected={isConnected}
            initialDataError={initialDataError}
            lastPersonnelSyncAt={lastPersonnelSyncAt}
            onRetry={retryInitialData}
            developmentPreviewCount={isDevelopmentMapPreview ? developmentMapPersonnel.length : 0}
          />
        </Suspense>
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
