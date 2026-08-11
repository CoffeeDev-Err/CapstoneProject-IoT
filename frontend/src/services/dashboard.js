import { API_URL } from './runtime'

export const getDashboardSummary = async () => {
  const response = await fetch(`${API_URL}/api/dashboard/summary`)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to load dashboard summary.')
  }
  return payload
}
