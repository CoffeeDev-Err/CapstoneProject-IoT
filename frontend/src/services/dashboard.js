const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const getDashboardSummary = async () => {
  const response = await fetch(`${API_URL}/api/dashboard/summary`)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to load dashboard summary.')
  }
  return payload
}
