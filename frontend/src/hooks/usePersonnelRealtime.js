import { useCallback, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { usePersonnelSocketSubscriptions } from '../features/realtime/usePersonnelSocketSubscriptions'
import { useRealtimeNotifications } from '../features/realtime/useRealtimeNotifications'
import { getReports } from '../services/operations'

export const usePersonnelRealtime = () => {
  const { isAuthenticated } = useAuth()
  const [personnel, setPersonnel] = useState([])
  const [statusMessage, setStatusMessage] = useState('Listening for live GPS updates...')
  const [reports, setReports] = useState([])
  const [reportsRevision, setReportsRevision] = useState(0)
  const [deployments, setDeployments] = useState([])
  const [tasks, setTasks] = useState([])
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(false)
  const [initialDataError, setInitialDataError] = useState('')
  const [lastPersonnelSyncAt, setLastPersonnelSyncAt] = useState('')
  const [initialLoadVersion, setInitialLoadVersion] = useState(0)
  const [operationalAlert, setOperationalAlert] = useState(null)
  const outsidePersonnelIdsRef = useRef(new Set())

  const {
    notifications,
    unreadNotificationCount,
    addNotification,
    markNotificationAsRead,
    markAllNotificationsRead,
    clearNotifications,
  } = useRealtimeNotifications(isAuthenticated)

  const isConnected = usePersonnelSocketSubscriptions({
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
  })

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

  const activePersonnel = useMemo(
    () => personnel.filter((member) => member.isVisibleOnMap !== false),
    [personnel]
  )
  const personnelCount = activePersonnel.length
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
