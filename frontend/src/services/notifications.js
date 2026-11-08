import { apiRequest } from './apiClient'

export const sendPersonnelAnnouncement = (announcement) => apiRequest('/api/notifications/announcements', {
  method: 'POST', body: JSON.stringify(announcement),
})

// The supervisor stream is resolved server-side from the authenticated session.
// A recipient id is deliberately not sent: the API ignores one so that a
// supervisor cannot address an individual officer's notifications.
export const getNotificationPage = async ({ cursor, limit = 50 } = {}) => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  const payload = await apiRequest(`/api/notifications?${params.toString()}`)
  return {
    notifications: Array.isArray(payload.notifications) ? payload.notifications : [],
    pagination: payload.pagination || { limit, hasNextPage: false, nextCursor: null },
    unreadCount: Number(payload.unreadCount) || 0,
  }
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
