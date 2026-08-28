import { useEffect, useState } from 'react'
import policePersonnel1 from '../../assets/policepersonnel1.jpg'
import policePersonnel2 from '../../assets/policepersonnel2.png'
import { getDeployments, getReports, getTasks } from '../../services/operations'
import { getPersonnel } from '../../services/personnel'
import { socket } from '../../services/socket'
import { resolveApiAssetUrl } from '../../services/apiAssets'
import { isInsideCabagan } from '../../utils/cabaganGeofence'
import {
  evaluateGeofenceTransition,
  mergeReports,
  upsertTask as upsertTaskState,
} from './realtimeState'

const personnelPhotos = {
  'pcpl-001': policePersonnel1,
  'psms-002': policePersonnel2,
}

const normalizePersonnel = (member) => ({
  ...member,
  photoUrl: resolveApiAssetUrl(member.photoUrl) || personnelPhotos[member.id],
})

const normalizeAndTagPersonnel = (member) => {
  const normalized = normalizePersonnel(member)
  const hasCurrentCoordinates = normalized.isLocationStale !== true
    && Number.isFinite(normalized.latitude)
    && Number.isFinite(normalized.longitude)

  return {
    ...normalized,
    isInsideCabagan: hasCurrentCoordinates
      ? isInsideCabagan(normalized.latitude, normalized.longitude)
      : null,
  }
}

export const usePersonnelSocketSubscriptions = ({
  addNotification,
  initialLoadVersion,
  isAuthenticated,
  outsidePersonnelIdsRef,
  setDeployments,
  setInitialDataError,
  setIsInitialDataLoading,
  setLastPersonnelSyncAt,
  setOperationalAlert,
  setPersonnel,
  setReports,
  setReportsRevision,
  setStatusMessage,
  setTasks,
}) => {
  const [isConnected, setIsConnected] = useState(socket.connected)

  useEffect(() => {
    let isCurrent = true

    if (!isAuthenticated) {
      queueMicrotask(() => setIsInitialDataLoading(false))
      socket.disconnect()
      return undefined
    }

    queueMicrotask(() => {
      if (isCurrent) setIsInitialDataLoading(true)
    })
    if (!socket.connected) socket.connect()

    const evaluateGeofence = (list) => {
      const transition = evaluateGeofenceTransition(list, outsidePersonnelIdsRef.current)
      outsidePersonnelIdsRef.current = transition.outsideIds
      return transition
    }

    const onConnect = () => {
      setIsConnected(true)
      setStatusMessage('Connected to GeoSentri realtime server.')
      addNotification({
        type: 'success',
        title: 'Realtime Connected',
        message: 'Live GPS stream is now active.',
      })
    }

    const onDisconnect = () => {
      setIsConnected(false)
      setStatusMessage('Connection lost. Attempting to reconnect...')
      addNotification({
        type: 'warning',
        title: 'Connection Lost',
        message: 'Realtime server disconnected. Reconnecting automatically.',
      })
    }

    const onBootstrap = (payload) => {
      if (!Array.isArray(payload)) return
      const normalized = payload.map(normalizeAndTagPersonnel)
      setPersonnel(normalized)
      setLastPersonnelSyncAt(new Date().toISOString())

      const { outsidePersonnel } = evaluateGeofence(normalized)
      if (outsidePersonnel.length > 0) {
        const names = outsidePersonnel.map((member) => member.name).join(', ')
        const verb = outsidePersonnel.length === 1 ? 'is' : 'are'
        const message = `${names} ${verb} outside the Cabagan boundary.`
        setStatusMessage(message)
        setOperationalAlert({ type: 'geofence', message, timestamp: new Date().toISOString() })
        addNotification({ type: 'geofence', title: 'Geofence Alert', message })
        return
      }

      if (normalized.length > 0) {
        addNotification({
          type: 'info',
          title: 'Personnel Sync Complete',
          message: 'Initial personnel locations were loaded successfully.',
        })
      }
    }

    const onUpdate = (payload) => {
      if (!Array.isArray(payload)) return
      const normalized = payload.map(normalizeAndTagPersonnel)
      setPersonnel(normalized)
      setLastPersonnelSyncAt(new Date().toISOString())
      setInitialDataError('')

      const { newlyOutside, hasRecovered } = evaluateGeofence(normalized)
      if (newlyOutside.length > 0) {
        const names = newlyOutside.map((member) => member.name).join(', ')
        const verb = newlyOutside.length === 1 ? 'is' : 'are'
        const message = `${names} ${verb} outside the Cabagan boundary.`
        setStatusMessage(message)
        setOperationalAlert({ type: 'geofence', message, timestamp: new Date().toISOString() })
        addNotification({ type: 'geofence', title: 'Geofence Alert', message })
        return
      }

      if (hasRecovered) {
        const message = 'All tracked personnel are back inside the Cabagan boundary.'
        setStatusMessage(message)
        setOperationalAlert({ type: 'success', message, timestamp: new Date().toISOString() })
        addNotification({ type: 'success', title: 'Geofence Normalized', message })
      }
    }

    const onEmergencyStatus = (payload) => {
      const message = payload?.message || 'Emergency status updated.'
      setStatusMessage(message)
      setOperationalAlert({ type: 'emergency', message, timestamp: new Date().toISOString() })
      addNotification({ type: 'emergency', title: 'Emergency Status', message })
    }

    const onEmergencyAlert = (payload) => {
      const message = payload?.message || 'Emergency alert triggered.'
      setStatusMessage(message)
      setOperationalAlert({
        type: 'emergency',
        message,
        timestamp: payload?.timestamp || new Date().toISOString(),
      })
      addNotification({ type: 'emergency', title: 'Emergency Alert', message })
    }

    const mergeReportUpdates = (updates) => {
      if (!Array.isArray(updates) || updates.length === 0) return
      setReports((previousReports) => mergeReports(previousReports, updates))
    }

    const onReportsBootstrap = (payload) => mergeReportUpdates(payload)
    const onReportSubmitted = (payload) => {
      mergeReportUpdates([payload])
      setReportsRevision((revision) => revision + 1)
      addNotification({
        type: 'info',
        title: 'New Police Report',
        message: `${payload.officer || 'An officer'} submitted ${payload.id}.`,
        timestamp: payload.date_time,
      })
    }
    const onReportResolved = (payload) => {
      const reportId = payload?.report_id || payload?.id
      if (!reportId) return
      mergeReportUpdates([{
        ...payload,
        report_id: reportId,
        case_status: 'resolved',
        resolved_at: payload.resolved_at || new Date().toISOString(),
      }])
      setReportsRevision((revision) => revision + 1)
      addNotification({
        type: 'success',
        title: 'Case Resolved',
        message: `${reportId} was marked resolved from the mobile app.`,
        timestamp: payload.resolved_at,
      })
    }
    const onReportUpdated = (payload) => {
      mergeReportUpdates([payload])
      setReportsRevision((revision) => revision + 1)
    }

    const onDeploymentsBootstrap = (payload) => {
      if (Array.isArray(payload)) setDeployments(payload)
    }
    const onDeploymentsUpdated = (payload) => {
      if (!Array.isArray(payload)) return
      setDeployments(payload)
      addNotification({
        type: 'info',
        title: 'Deployment Updated',
        message: `${payload.length} active personnel assignment${payload.length === 1 ? '' : 's'} synced.`,
      })
    }

    const upsertTask = (payload) => {
      if (payload?.id) setTasks((current) => upsertTaskState(current, payload))
    }
    const onTasksBootstrap = (payload) => {
      if (Array.isArray(payload)) setTasks(payload)
    }
    const onTaskCreated = (payload) => {
      upsertTask(payload)
      if (payload.type === 'backup') {
        setOperationalAlert({
          type: 'emergency',
          message: `${payload.title} at ${payload.location}.`,
          timestamp: payload.created_at || new Date().toISOString(),
        })
      }
      addNotification({
        type: 'emergency',
        title: payload.type === 'backup' ? 'Backup Request' : 'Urgent Task',
        message: `${payload.title} at ${payload.location}.`,
        timestamp: payload.created_at,
      })
    }

    const onPersonnelInactivity = (payload) => {
      const message = payload?.message || 'An on-duty officer has no detected movement.'
      setStatusMessage(message)
      setOperationalAlert({
        type: 'warning',
        message,
        timestamp: payload?.timestamp || new Date().toISOString(),
      })
      addNotification({
        type: 'warning',
        title: payload?.title || 'Personnel Inactivity',
        message,
        timestamp: payload?.timestamp,
      })
    }

    const onPersonnelIdentityUpdated = (payload) => {
      if (!payload?.personnelId) return
      setPersonnel((current) => current.map((member) => (
        member.id === payload.personnelId
          ? {
              ...member,
              name: payload.name || member.name,
              rank: payload.rank || member.rank,
              photoUrl: payload.photoUrl
                ? resolveApiAssetUrl(payload.photoUrl)
                : member.photoUrl,
            }
          : member
      )))
      setReports((current) => current.map((report) => (
        report.personnel_id === payload.personnelId
          ? { ...report, officer: payload.name || report.officer }
          : report
      )))
      setDeployments((current) => current.map((deployment) => (
        deployment.personnelId === payload.personnelId
          ? {
              ...deployment,
              personnelName: payload.name || deployment.personnelName,
              rank: payload.rank || deployment.rank,
            }
          : deployment
      )))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('personnel:bootstrap', onBootstrap)
    socket.on('personnel:update', onUpdate)
    socket.on('personnel:identity-updated', onPersonnelIdentityUpdated)
    socket.on('emergency:status', onEmergencyStatus)
    socket.on('emergency:alert', onEmergencyAlert)
    socket.on('reports:bootstrap', onReportsBootstrap)
    socket.on('report:submitted', onReportSubmitted)
    socket.on('report:resolved', onReportResolved)
    socket.on('report:updated', onReportUpdated)
    socket.on('deployments:bootstrap', onDeploymentsBootstrap)
    socket.on('deployments:updated', onDeploymentsUpdated)
    socket.on('tasks:bootstrap', onTasksBootstrap)
    socket.on('task:created', onTaskCreated)
    socket.on('task:updated', upsertTask)
    socket.on('personnel:inactivity', onPersonnelInactivity)

    Promise.allSettled([getPersonnel(), getReports(), getDeployments(), getTasks()])
      .then(([personnelResult, reportResult, deploymentResult, taskResult]) => {
        if (!isCurrent) return
        const unavailable = []
        if (personnelResult.status === 'fulfilled') onBootstrap(personnelResult.value)
        else unavailable.push('live personnel')
        if (reportResult.status === 'fulfilled') onReportsBootstrap(reportResult.value)
        else unavailable.push('reports')
        if (deploymentResult.status === 'fulfilled') onDeploymentsBootstrap(deploymentResult.value)
        else unavailable.push('deployments')
        if (taskResult.status === 'fulfilled') onTasksBootstrap(taskResult.value)
        else unavailable.push('active operations')

        setInitialDataError(unavailable.length > 0
          ? `Unable to load ${unavailable.join(', ')}. Existing live data will remain visible while you retry.`
          : '')
      })
      .finally(() => {
        if (isCurrent) setIsInitialDataLoading(false)
      })

    return () => {
      isCurrent = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('personnel:bootstrap', onBootstrap)
      socket.off('personnel:update', onUpdate)
      socket.off('personnel:identity-updated', onPersonnelIdentityUpdated)
      socket.off('emergency:status', onEmergencyStatus)
      socket.off('emergency:alert', onEmergencyAlert)
      socket.off('reports:bootstrap', onReportsBootstrap)
      socket.off('report:submitted', onReportSubmitted)
      socket.off('report:resolved', onReportResolved)
      socket.off('report:updated', onReportUpdated)
      socket.off('deployments:bootstrap', onDeploymentsBootstrap)
      socket.off('deployments:updated', onDeploymentsUpdated)
      socket.off('tasks:bootstrap', onTasksBootstrap)
      socket.off('task:created', onTaskCreated)
      socket.off('task:updated', upsertTask)
      socket.off('personnel:inactivity', onPersonnelInactivity)
      socket.disconnect()
    }
  }, [addNotification, initialLoadVersion, isAuthenticated, outsidePersonnelIdsRef,
    setDeployments, setInitialDataError, setIsInitialDataLoading, setLastPersonnelSyncAt,
    setOperationalAlert, setPersonnel, setReports, setReportsRevision, setStatusMessage, setTasks])

  return isConnected
}
