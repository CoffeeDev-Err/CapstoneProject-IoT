const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const getCollection = async (path, fallbackMessage) => {
  const response = await fetch(`${API_URL}${path}`)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || fallbackMessage)
  }

  return Array.isArray(payload.data) ? payload.data : []
}

export const getReports = () => (
  getCollection('/api/reports?limit=100', 'Unable to load reports.')
)

export const getDeployments = () => (
  getCollection('/api/deployments?limit=100', 'Unable to load deployments.')
)

export const replaceDeployments = async (assignments) => {
  const response = await fetch(`${API_URL}/api/deployments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments }),
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to save deployment assignments.')
  }

  return payload.deployments
}
