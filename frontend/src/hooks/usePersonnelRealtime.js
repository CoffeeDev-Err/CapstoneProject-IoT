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
import policePersonnel3 from '../assets/policepersonnel3.jpg'
import { REPORT_RECORDS } from '../data/reportRecords'
import { socket } from '../services/socket'
import { isInsideCabagan } from '../utils/cabaganGeofence'

const personnelPhotos = {
  'pcpl-001': policePersonnel1,
  'psms-002': policePersonnel2,
  'pltc-003': policePersonnel3,
}

const personnelProfileById = {
  'pcpl-001': {
    badge: 'P-1001',
    name: 'Mon Maguas',
    rank: 'Police Corporal',
  },
  'psms-002': {
    badge: 'P-1002',
    name: 'GerryBoy Aggabao',
    rank: 'Police Staff Sergeant',
  },
  'pltc-003': {
    badge: 'P-1003',
    name: 'Romel Manzano',
    rank: 'Police Lieutenant',
  },
}

const withPersonnelPhoto = (member) => ({
  ...member,
  photoUrl: personnelPhotos[member.id] || member.photoUrl,
})

const withCanonicalProfile = (member) => ({
  ...member,
  ...(personnelProfileById[member.id] || {}),
})

const normalizePersonnel = (member) => withCanonicalProfile(withPersonnelPhoto(member))

const withBoundaryStatus = (member) => ({
  ...member,
  isInsideCabagan: isInsideCabagan(member.latitude, member.longitude),
})

const normalizeAndTagPersonnel = (member) => withBoundaryStatus(normalizePersonnel(member))

const MAX_NOTIFICATIONS = 25

/**
 * Fallback data shown in the map before the first server message arrives.
 * Prevents an empty map flash on initial page load.
 */
const defaultPersonnel = [
  normalizeAndTagPersonnel({
    id: 'pcpl-001',
    locationName: 'Cabagan Public Market',
    latitude: 17.4271,
    longitude: 121.7692,
    status: 'On Patrol',
    lastUpdated: new Date().toISOString(),
  }),
  normalizeAndTagPersonnel({
    id: 'psms-002',
    locationName: 'Cabagan Municipal Hall',
    latitude: 17.4213,
    longitude: 121.7683,
    status: 'Monitoring',
    lastUpdated: new Date().toISOString(),
  }),
  normalizeAndTagPersonnel({
    id: 'pltc-003',
    locationName: 'Barangay Centro',
    latitude: 17.4189,
    longitude: 121.7748,
    status: 'Responding',
    lastUpdated: new Date().toISOString(),
  }),
]

export const usePersonnelRealtime = () => {
  // Full live officer list — replaced every time the server emits an update
  const [personnel, setPersonnel] = useState(defaultPersonnel)

  // Mirrors the Socket.IO connected flag so the TopBar pill stays accurate
  const [isConnected, setIsConnected] = useState(socket.connected)

  // Human-readable status shown in the SidePanel status card
  const [statusMessage, setStatusMessage] = useState('Listening for live GPS updates...')

  // Shared top-bar notifications for geofence, emergency, and system events
  const [notifications, setNotifications] = useState([])

  // Report records stay available app-wide so mobile status events update analytics immediately.
  const [reports, setReports] = useState(REPORT_RECORDS)
  const [deployments, setDeployments] = useState([])

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
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, isRead: true })))
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const evaluateGeofence = (list) => {
    const outsidePersonnel = list.filter((member) => !member.isInsideCabagan)
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
    // ── Event handlers ──────────────────────────────────────────────────────

    const onConnect = () => {
      setIsConnected(true)
      setStatusMessage('Connected to BantayCabagan realtime server.')
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
      if (Array.isArray(payload) && payload.length > 0) {
        const normalized = payload.map(normalizeAndTagPersonnel)
        setPersonnel(normalized)

        const { outsidePersonnel } = evaluateGeofence(normalized)
        if (outsidePersonnel.length > 0) {
          const names = outsidePersonnel.map((member) => member.name).join(', ')
          const message = `⚠️ Geofence Alert: ${names} outside Cabagan boundary.`
          setStatusMessage(message)
          addNotification({
            type: 'geofence',
            title: 'Geofence Alert',
            message,
          })
          return
        }

        addNotification({
          type: 'info',
          title: 'Personnel Sync Complete',
          message: 'Initial personnel locations were loaded successfully.',
        })
      }
    }

    /**
     * personnel:update
     * Received every 4 seconds from the server setInterval.
     * Replaces the entire personnel array so all map markers move smoothly.
     */
    const onUpdate = (payload) => {
      if (Array.isArray(payload) && payload.length > 0) {
        const normalized = payload.map(normalizeAndTagPersonnel)
        setPersonnel(normalized)

        const { newlyOutside, hasRecovered } = evaluateGeofence(normalized)

        if (newlyOutside.length > 0) {
          const names = newlyOutside.map((member) => member.name).join(', ')
          const message = `⚠️ Geofence Alert: ${names} outside Cabagan boundary.`
          setStatusMessage(message)
          addNotification({
            type: 'geofence',
            title: 'Geofence Alert',
            message,
          })
          return
        }

        if (hasRecovered) {
          const message = '✅ All tracked personnel are back inside Cabagan boundary.'
          setStatusMessage(message)
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

    const onTaskCreated = (payload) => {
      addNotification({
        type: 'emergency',
        title: payload.type === 'backup' ? 'Backup Request' : 'Urgent Task',
        message: `${payload.title} at ${payload.location}.`,
        timestamp: payload.created_at,
      })
    }

    // ── Register listeners on the shared socket instance ────────────────────
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('personnel:bootstrap', onBootstrap)
    socket.on('personnel:update', onUpdate)
    socket.on('emergency:status', onEmergencyStatus)
    socket.on('emergency:alert', onEmergencyAlert)
    socket.on('reports:bootstrap', onReportsBootstrap)
    socket.on('report:submitted', onReportSubmitted)
    socket.on('report:resolved', onReportResolved)
    socket.on('deployments:bootstrap', onDeploymentsBootstrap)
    socket.on('deployments:updated', onDeploymentsUpdated)
    socket.on('task:created', onTaskCreated)

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    // Removes all listeners when the PersonnelProvider unmounts to prevent
    // stale handlers or memory leaks.
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('personnel:bootstrap', onBootstrap)
      socket.off('personnel:update', onUpdate)
      socket.off('emergency:status', onEmergencyStatus)
      socket.off('emergency:alert', onEmergencyAlert)
      socket.off('reports:bootstrap', onReportsBootstrap)
      socket.off('report:submitted', onReportSubmitted)
      socket.off('report:resolved', onReportResolved)
      socket.off('deployments:bootstrap', onDeploymentsBootstrap)
      socket.off('deployments:updated', onDeploymentsUpdated)
      socket.off('task:created', onTaskCreated)
    }
  }, [addNotification]) // Subscribe once and keep notification handler current

  // Derive the count from the array so consumers don't have to compute it
  const personnelCount = useMemo(() => personnel.length, [personnel])
  const outOfBoundaryPersonnel = useMemo(
    () => personnel.filter((member) => !member.isInsideCabagan),
    [personnel]
  )
  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  )

  return {
    personnel,
    reports,
    deployments,
    personnelCount,
    outOfBoundaryPersonnel,
    isConnected,
    statusMessage,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsRead,
    clearNotifications,
  }
}
