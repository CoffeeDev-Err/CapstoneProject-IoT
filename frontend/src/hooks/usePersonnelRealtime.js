/**
 * usePersonnelRealtime.js — Socket.IO Live GPS Data Hook
 *
 * Custom React hook that subscribes to the BantayCabagan backend Socket.IO
 * server and keeps the personnel list in sync with live GPS updates that
 * the server broadcasts every 4 seconds.
 *
 * Socket events handled:
 *   connect             — fired when the socket connects successfully
 *   disconnect          — fired when the connection drops
 *   personnel:bootstrap — one-time full officer list sent on first connect
 *   personnel:update    — periodic full list with updated GPS coordinates
 *   emergency:status    — ack sent back only to the requesting client
 *   emergency:alert     — broadcast to ALL clients when backup is requested
 *
 * Returns:
 *   {
 *     personnel:      Officer[]  — current officers with live GPS positions
 *     personnelCount: number     — memoised length of the personnel array
 *     isConnected:    boolean    — true when the socket is connected
 *     statusMessage:  string     — human-readable status for the side panel
 *   }
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import policePersonnel1 from '../assets/policepersonnel1.jpg'
import policePersonnel2 from '../assets/policepersonnel2.png'
import {
  deleteNotifications,
  getNotifications,
  readAllNotifications,
  readNotification,
} from '../services/notifications'
import { getDeployments, getReports, getTasks } from '../services/operations'
import { getPersonnel } from '../services/personnel'
import { socket } from '../services/socket'
import { resolveApiAssetUrl } from '../services/apiAssets'
import { isInsideCabagan } from '../utils/cabaganGeofence'
import { useAuth } from '../context/useAuth'

const personnelPhotos = {
  'pcpl-001': policePersonnel1,
  'psms-002': policePersonnel2,
}

const withPersonnelPhoto = (member) => ({
  ...member,
  photoUrl: resolveApiAssetUrl(member.photoUrl) || personnelPhotos[member.id],
})

const normalizePersonnel = (member) => withPersonnelPhoto(member)

const withBoundaryStatus = (member) => {
  const hasCurrentCoordinates = member.isLocationStale !== true
    && Number.isFinite(member.latitude)
    && Number.isFinite(member.longitude)

  return {
    ...member,
    isInsideCabagan: hasCurrentCoordinates
      ? isInsideCabagan(member.latitude, member.longitude)
      : null,
  }
}

const normalizeAndTagPersonnel = (member) => withBoundaryStatus(normalizePersonnel(member))

const MAX_NOTIFICATIONS = 25

/**
 * Fallback data shown in the map before the first server message arrives.
 * Prevents an empty map flash on initial page load.
 */
export const usePersonnelRealtime = () => {
  const { isAuthenticated } = useAuth()
  // Full live officer list — replaced every time the server emits an update
  const [personnel, setPersonnel] = useState([])

  // Mirrors the Socket.IO connected flag so the TopBar pill stays accurate
  const [isConnected, setIsConnected] = useState(socket.connected)

  // Human-readable status shown in the SidePanel status card
  const [statusMessage, setStatusMessage] = useState('Listening for live GPS updates...')

  // Shared top-bar notifications for geofence, emergency, and system events
  const [notifications, setNotifications] = useState([])

  // Report records stay available app-wide so mobile status events update analytics immediately.
  const [reports, setReports] = useState([])
  const [reportsRevision, setReportsRevision] = useState(0)
  const [deployments, setDeployments] = useState([])
  const [tasks, setTasks] = useState([])
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(false)
  const [initialDataError, setInitialDataError] = useState('')
  const [lastPersonnelSyncAt, setLastPersonnelSyncAt] = useState('')
  const [initialLoadVersion, setInitialLoadVersion] = useState(0)
  const [operationalAlert, setOperationalAlert] = useState(null)

  const retryInitialData = useCallback(() => {
    setInitialDataError('')
    setIsInitialDataLoading(true)
    setInitialLoadVersion((version) => version + 1)
  }, [])

  const refreshReports = useCallback(async () => {
    const reportPayload = await getReports()
    setReports(reportPayload)
    return reportPayload
  }, [])

  // Tracks which personnel are currently outside Cabagan to avoid repeated alerts
  const outsidePersonnelIdsRef = useRef(new Set())
  const notificationSequenceRef = useRef(0)

  const createNotification = useCallback((payload) => {
    notificationSequenceRef.current += 1

    return {
      id: `notif-${Date.now()}-${notificationSequenceRef.current}`,
      type: payload.type || 'info',
      title: payload.title || 'System Update',
      message: payload.message || 'A new update is available.',
      timestamp: payload.timestamp || new Date().toISOString(),
      isRead: false,
    }
  }, [])

  const addNotification = useCallback((payload) => {
    setNotifications((prev) => [createNotification(payload), ...prev].slice(0, MAX_NOTIFICATIONS))
  }, [createNotification])

  const markNotificationAsRead = useCallback((notificationId) => {
    setNotifications((prev) => prev.map((notification) => (
      notification.id === notificationId
        ? { ...notification, isRead: true }
        : notification
    )))
    readNotification(notificationId).catch(() => {})
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, isRead: true })))
    readAllNotifications().catch(() => {})
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
    deleteNotifications().catch(() => {})
  }, [])

  const evaluateGeofence = (list) => {
    const outsidePersonnel = list.filter((member) => (
      member.isVisibleOnMap !== false && member.isInsideCabagan === false
    ))
    const outsideIds = new Set(outsidePersonnel.map((member) => member.id))
    const newlyOutside = outsidePersonnel.filter((member) => !outsidePersonnelIdsRef.current.has(member.id))
    const hasRecovered = outsidePersonnel.length === 0 && outsidePersonnelIdsRef.current.size > 0

    outsidePersonnelIdsRef.current = outsideIds

    return {
      outsidePersonnel,
      newlyOutside,
      hasRecovered,
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return undefined
    getNotifications()
      .then((history) => {
        setNotifications((current) => {
          const notificationsById = new Map()
          current.forEach((notification) => notificationsById.set(notification.id, notification))
          history.forEach((notification) => {
            if (!notificationsById.has(notification.id)) {
              notificationsById.set(notification.id, notification)
            }
          })
          return [...notificationsById.values()]
            .sort((first, second) => (
              new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime()
            ))
            .slice(0, MAX_NOTIFICATIONS)
        })
      })
      .catch(() => {})
  }, [isAuthenticated])

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
    // ── Event handlers ──────────────────────────────────────────────────────

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

    /**
     * personnel:bootstrap
     * Received once right after the socket connects.
     * Replaces the default fallback with the real data from the server.
     */
    const onBootstrap = (payload) => {
      if (Array.isArray(payload)) {
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
          addNotification({
            type: 'geofence',
            title: 'Geofence Alert',
            message,
          })
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
    }

    /**
     * personnel:update
     * Received whenever Flespi publishes a new tracker fix (the deployed
     * tracker uploads every 10 seconds), with REST polling as fallback.
     * Replaces the personnel snapshot so map markers can interpolate between
     * the last confirmed position and the new fix.
     */
    const onUpdate = (payload) => {
      if (Array.isArray(payload)) {
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
          addNotification({
            type: 'geofence',
            title: 'Geofence Alert',
            message,
          })
          return
        }

        if (hasRecovered) {
          const message = 'All tracked personnel are back inside the Cabagan boundary.'
          setStatusMessage(message)
          setOperationalAlert({ type: 'success', message, timestamp: new Date().toISOString() })
          addNotification({
            type: 'success',
            title: 'Geofence Normalized',
            message,
          })
        }
      }
    }

    /**
     * emergency:status
     * Sent only to the client that triggered the backup request.
     * Tells the supervisor whether the request was processed successfully.
     */
    const onEmergencyStatus = (payload) => {
      const message = payload?.message || 'Emergency status updated.'
      setStatusMessage(message)
      setOperationalAlert({ type: 'emergency', message, timestamp: new Date().toISOString() })
      addNotification({
        type: 'emergency',
        title: 'Emergency Status',
        message,
      })
    }

    /**
     * emergency:alert
     * Broadcast to ALL connected clients simultaneously.
     * Every logged-in supervisor sees who requested backup and where.
     */
    const onEmergencyAlert = (payload) => {
      const message = payload?.message || 'Emergency alert triggered.'
      setStatusMessage(message)
      setOperationalAlert({
        type: 'emergency',
        message,
        timestamp: payload?.timestamp || new Date().toISOString(),
      })
      addNotification({
        type: 'emergency',
        title: 'Emergency Alert',
        message,
      })
    }

    const mergeReportUpdates = (updates) => {
      if (!Array.isArray(updates) || updates.length === 0) return

      setReports((previousReports) => {
        const reportsById = new Map(previousReports.map((report) => [report.id, report]))

        updates.forEach((update) => {
          const reportId = update.report_id || update.id
          if (!reportId) return

          reportsById.set(reportId, {
            ...(reportsById.get(reportId) || {}),
            ...update,
            id: reportId,
          })
        })

        return [...reportsById.values()]
      })
    }

    const onReportsBootstrap = (payload) => {
      mergeReportUpdates(payload)
    }

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
      if (!payload?.id) return
      setTasks((current) => {
        const existingIndex = current.findIndex((task) => task.id === payload.id)
        if (existingIndex < 0) return [payload, ...current]
        return current.map((task) => task.id === payload.id ? { ...task, ...payload } : task)
      })
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

    const onTaskUpdated = (payload) => {
      upsertTask(payload)
    }

    const onReportUpdated = (payload) => {
      mergeReportUpdates([payload])
      setReportsRevision((revision) => revision + 1)
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
              photoUrl: payload.photoUrl ? resolveApiAssetUrl(payload.photoUrl) : member.photoUrl,
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

    // ── Register listeners on the shared socket instance ────────────────────
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
    socket.on('task:updated', onTaskUpdated)
    socket.on('personnel:inactivity', onPersonnelInactivity)

    Promise.allSettled([
      getPersonnel(),
      getReports(),
      getDeployments(),
      getTasks(),
    ])
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

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    // Removes all listeners when the PersonnelProvider unmounts to prevent
    // stale handlers or memory leaks.
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
      socket.off('task:updated', onTaskUpdated)
      socket.off('personnel:inactivity', onPersonnelInactivity)
      socket.disconnect()
    }
  }, [addNotification, initialLoadVersion, isAuthenticated])

  // Derive the count from the array so consumers don't have to compute it
  const activePersonnel = useMemo(
    () => personnel.filter((member) => member.isVisibleOnMap !== false),
    [personnel]
  )
  const personnelCount = useMemo(() => activePersonnel.length, [activePersonnel])
  const outOfBoundaryPersonnel = useMemo(
    () => activePersonnel.filter((member) => member.isInsideCabagan === false),
    [activePersonnel]
  )
  const stalePersonnel = useMemo(
    () => personnel.filter((member) => (
      member.isOnDuty !== false && member.locationStatus !== 'current'
    )),
    [personnel]
  )
  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  )

  return {
    personnel,
    activePersonnel,
    reports,
    reportsRevision,
    deployments,
    tasks,
    isInitialDataLoading,
    initialDataError,
    lastPersonnelSyncAt,
    personnelCount,
    outOfBoundaryPersonnel,
    stalePersonnel,
    isConnected: Boolean(isAuthenticated && isConnected),
    statusMessage,
    operationalAlert,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsRead,
    clearNotifications,
    refreshReports,
    retryInitialData,
  }
}
