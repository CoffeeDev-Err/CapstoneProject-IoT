import { apiRequest } from './apiClient'

export const getNotifications = async () => {
  const payload = await apiRequest('/api/notifications?recipient_id=supervisor')
  return Array.isArray(payload.notifications) ? payload.notifications : []
}

export const readNotification = (notificationId) => (
  apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
)

export const readAllNotifications = () => (
  apiRequest('/api/notifications/read-all', {
    method: 'PATCH',
    body: JSON.stringify({ recipient_id: 'supervisor' }),
  })
)

export const deleteNotifications = () => (
  apiRequest('/api/notifications?recipient_id=supervisor', { method: 'DELETE' })
)
