const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const request = async (path, options) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || 'Notification request failed.')
  return payload
}

export const getNotifications = async () => {
  const payload = await request('/api/notifications?recipient_id=supervisor')
  return Array.isArray(payload.notifications) ? payload.notifications : []
}

export const readNotification = (notificationId) => (
  request(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
)

export const readAllNotifications = () => (
  request('/api/notifications/read-all', {
    method: 'PATCH',
    body: JSON.stringify({ recipient_id: 'supervisor' }),
  })
)

export const deleteNotifications = () => (
  request('/api/notifications?recipient_id=supervisor', { method: 'DELETE' })
)
