import { apiRequest } from './apiClient'

// The supervisor stream is resolved server-side from the authenticated session.
// A recipient id is deliberately not sent: the API ignores one so that a
// supervisor cannot address an individual officer's notifications.
export const getNotifications = async () => {
  const payload = await apiRequest('/api/notifications')
  return Array.isArray(payload.notifications) ? payload.notifications : []
}

export const readNotification = (notificationId) => (
  apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
)

export const readAllNotifications = () => (
  apiRequest('/api/notifications/read-all', { method: 'PATCH' })
)

export const deleteNotifications = () => (
  apiRequest('/api/notifications', { method: 'DELETE' })
)
