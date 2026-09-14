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
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { MonitoringContentSkeleton } from '../components/LoadingSkeleton'
import ConfirmModal from '../components/ConfirmModal'
import ProfileModal from '../components/ProfileModal'
import SidePanel from '../components/SidePanel'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { useFeedback } from '../context/useFeedback'
import { useDevelopmentMapPersonnel } from '../hooks/useDevelopmentMapPersonnel'
import { completeTask, getTask } from '../services/operations'
import { requestErrorMessage } from '../utils/requestFeedback'

const PersonnelMap = lazy(() => import('../components/PersonnelMap'))

function MonitoringPage() {
  const location = useLocation()
  const { showFeedback } = useFeedback()
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
  const [selectedTask, setSelectedTask] = useState(null)
  const [completionConfirmOpen, setCompletionConfirmOpen] = useState(false)
  const [taskActionBusy, setTaskActionBusy] = useState(false)
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

  useEffect(() => {
    const requestedPersonnelId = location.state?.locatePersonnelId
    const requestedTaskId = location.state?.taskId
    if (!requestedPersonnelId && !requestedTaskId) return undefined

    let isCurrent = true
    const openPersonnel = (personnelId) => {
      if (!personnelId || !isCurrent) return
      setFollowedPersonnelId(personnelId)
      setSelectedPersonnelId(personnelId)
    }

    if (!requestedTaskId) {
      queueMicrotask(() => {
        if (!isCurrent) return
        setSelectedTask(null)
        openPersonnel(requestedPersonnelId)
      })
      return () => { isCurrent = false }
    }

    const activeTask = tasks.find((task) => task.id === requestedTaskId)
    if (activeTask) {
      queueMicrotask(() => {
        if (!isCurrent) return
        setSelectedTask(activeTask)
        openPersonnel(activeTask.requested_by || requestedPersonnelId)
      })
      return () => { isCurrent = false }
    }

    getTask(requestedTaskId).then((task) => {
      if (!isCurrent) return
      setSelectedTask(task)
      openPersonnel(task.requested_by || requestedPersonnelId)
    }).catch((error) => {
      if (!isCurrent) return
      setSelectedTask(null)
      openPersonnel(requestedPersonnelId)
      showFeedback(requestErrorMessage(error, { action: 'open the backup request' }), {
        type: 'error',
        title: 'Backup request could not be opened',
      })
    })
    return () => { isCurrent = false }
  }, [location.state?.notificationRequestId, location.state?.locatePersonnelId,
    location.state?.taskId, showFeedback, tasks])

  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null
    return tasks.find((task) => task.id === selectedTask.id) || selectedTask
  }, [selectedTask, tasks])

  const handleSelectPersonnel = (member) => {
    setSelectedTask(null)
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

  const handleCompleteTask = async () => {
    if (!currentSelectedTask || taskActionBusy) return
    setTaskActionBusy(true)
    try {
      const updatedTask = await completeTask(currentSelectedTask.id)
      setSelectedTask(updatedTask)
      setCompletionConfirmOpen(false)
      showFeedback(`${updatedTask.id} was marked completed.`, { type: 'success' })
    } catch (error) {
      showFeedback(requestErrorMessage(error, { action: 'complete the backup request', write: true }), {
        type: 'error',
        title: 'Backup request needs attention',
      })
    } finally {
      setTaskActionBusy(false)
    }
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
        selectedPersonnel={completionConfirmOpen ? null : selectedPersonnel}
        selectedTask={currentSelectedTask}
        taskActionBusy={taskActionBusy}
        onClose={() => {
          setSelectedPersonnelId(null)
          setSelectedTask(null)
        }}
        onLocate={() => handleLocatePersonnel(selectedPersonnel)}
        onCompleteTask={() => setCompletionConfirmOpen(true)}
      />
      <ConfirmModal
        open={completionConfirmOpen}
        title="Complete backup request?"
        message={currentSelectedTask?.type === 'backup'
          ? 'GeoSentri detected at least one responder at the request point. Confirm that the emergency assistance has ended; officers will see the updated status.'
          : 'Confirm that this task has been completed. Officers will see the updated status.'}
        confirmLabel={taskActionBusy ? 'Completing...' : 'Mark completed'}
        cancelLabel="Keep open"
        variant="primary"
        layerClassName="modal-backdrop--above-profile"
        onCancel={() => !taskActionBusy && setCompletionConfirmOpen(false)}
        onConfirm={handleCompleteTask}
      />
    </div>
  )
}

export default MonitoringPage
