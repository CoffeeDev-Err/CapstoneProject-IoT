import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteNotifications,
  getNotificationPage,
  readAllNotifications,
  readNotification,
} from '../../services/notifications'
import { mergeNotifications } from './realtimeState'
import { useFeedback } from '../../context/useFeedback'
import { requestErrorMessage } from '../../utils/requestFeedback'

export const useRealtimeNotifications = (isAuthenticated) => {
  const [notifications, setNotifications] = useState([])
  const [pagination, setPagination] = useState({ hasNextPage: false, nextCursor: null })
  const [loadingAllNotifications, setLoadingAllNotifications] = useState(false)
  const notificationSequenceRef = useRef(0)
  const { showFeedback } = useFeedback()
  const actionBusy = useRef(false)
  const historyBusy = useRef(false)
  const generation = useRef(0)

  const createNotification = useCallback((payload) => {
    notificationSequenceRef.current += 1

    return {
      ...payload,
      id: payload.id || `notif-${Date.now()}-${notificationSequenceRef.current}`,
      type: payload.type || 'info',
      title: payload.title || 'System Update',
      message: payload.message || 'A new update is available.',
      timestamp: payload.timestamp || new Date().toISOString(),
      isRead: false,
    }
  }, [])

  const addNotification = useCallback((payload) => {
    setNotifications((current) => (
      mergeNotifications(current, [createNotification(payload)])
    ))
  }, [createNotification])

  const loadAllNotifications = useCallback(async () => {
    if (!isAuthenticated || historyBusy.current || !pagination.hasNextPage) return
    const currentGeneration = generation.current
    historyBusy.current = true
    setLoadingAllNotifications(true)
    try {
      let cursor = pagination.nextCursor
      let lastPagination = pagination
      const history = []
      while (cursor && currentGeneration === generation.current) {
        const page = await getNotificationPage({ cursor, limit: 50 })
        history.push(...page.notifications)
        lastPagination = page.pagination
        cursor = page.pagination?.hasNextPage ? page.pagination.nextCursor : null
      }
      if (currentGeneration === generation.current) {
        setNotifications((current) => mergeNotifications(current, history))
        setPagination(lastPagination)
      }
    } catch (error) {
      if (currentGeneration === generation.current) showFeedback(requestErrorMessage(error, { action: 'load all notification history' }), {
        type: 'error', title: 'Notification history unavailable',
      })
    } finally {
      historyBusy.current = false
      if (currentGeneration === generation.current) setLoadingAllNotifications(false)
    }
  }, [isAuthenticated, pagination, showFeedback])

  const runAction = useCallback(async (action, request, apply) => {
    if (actionBusy.current || !isAuthenticated) return
    const currentGeneration = generation.current
    actionBusy.current = true
    try {
      await request()
      if (currentGeneration === generation.current) setNotifications(apply)
    } catch (error) {
      if (currentGeneration === generation.current) showFeedback(requestErrorMessage(error, { action, write: true }), {
        type: 'error', title: 'Notification update could not be confirmed',
      })
    } finally {
      if (currentGeneration === generation.current) actionBusy.current = false
    }
  }, [isAuthenticated, showFeedback])

  const markNotificationAsRead = useCallback((notificationId) => runAction(
    'mark the notification as read',
    // Locally generated status notifications have no server record.
    () => notificationId.startsWith('notif-') ? Promise.resolve() : readNotification(notificationId),
    (current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item),
  ), [runAction])

  const markAllNotificationsRead = useCallback(() => {
    const ids = new Set(notifications.map((item) => item.id))
    return runAction('mark notifications as read', readAllNotifications,
      (current) => current.map((item) => ids.has(item.id) ? { ...item, isRead: true } : item))
  }, [notifications, runAction])

  const clearNotifications = useCallback(() => {
    const ids = new Set(notifications.map((item) => item.id))
    return runAction('clear notifications', deleteNotifications,
      (current) => current.filter((item) => !ids.has(item.id)))
  }, [notifications, runAction])

  useEffect(() => {
    generation.current += 1
    actionBusy.current = false
    historyBusy.current = false
    if (!isAuthenticated) return undefined
    let active = true

    getNotificationPage({ limit: 50 })
      .then((page) => {
        if (!active) return
        setNotifications((current) => (
          mergeNotifications(current, page.notifications)
        ))
        setPagination(page.pagination)
      })
      .catch((error) => {
        if (active) showFeedback(requestErrorMessage(error, { action: 'load notification history' }), {
          type: 'error', title: 'Notifications unavailable',
        })
      })
    return () => { active = false; generation.current += 1 }
  }, [isAuthenticated, showFeedback])

  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  )

  return {
    notifications,
    unreadNotificationCount,
    addNotification,
    markNotificationAsRead,
    markAllNotificationsRead,
    clearNotifications,
    hasMoreNotifications: pagination.hasNextPage,
    loadingAllNotifications: isAuthenticated && loadingAllNotifications,
    loadAllNotifications,
  }
}
