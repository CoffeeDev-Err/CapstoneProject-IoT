import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteNotifications,
  getNotifications,
  readAllNotifications,
  readNotification,
} from '../../services/notifications'
import { mergeNotifications } from './realtimeState'

const MAX_NOTIFICATIONS = 25

export const useRealtimeNotifications = (isAuthenticated) => {
  const [notifications, setNotifications] = useState([])
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
    setNotifications((current) => (
      [createNotification(payload), ...current].slice(0, MAX_NOTIFICATIONS)
    ))
  }, [createNotification])

  const markNotificationAsRead = useCallback((notificationId) => {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId
        ? { ...notification, isRead: true }
        : notification
    )))
    readNotification(notificationId).catch(() => {})
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((current) => current.map((notification) => ({
      ...notification,
      isRead: true,
    })))
    readAllNotifications().catch(() => {})
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
    deleteNotifications().catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    getNotifications()
      .then((history) => {
        setNotifications((current) => (
          mergeNotifications(current, history, MAX_NOTIFICATIONS)
        ))
      })
      .catch(() => {})
  }, [isAuthenticated])

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
  }
}
