import { AUTH_TOKEN_KEY } from './auth'
import { API_URL } from './runtime'

const getAuthHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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

export const getManageableDeployments = () => (
  getCollection(
    '/api/deployments?view=manageable&limit=100',
    'Unable to load current and scheduled deployments.',
  )
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

export const updateReportValidation = async (reportId, validationStatus) => {
  const response = await fetch(
    `${API_URL}/api/reports/${encodeURIComponent(reportId)}/validation`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ validation_status: validationStatus }),
    },
  )
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to update report validation.')
  }

  return payload.report
}

export const getReportRoute = async (reportId) => {
  const response = await fetch(
    `${API_URL}/api/reports/${encodeURIComponent(reportId)}/route`,
    { headers: getAuthHeaders() },
  )
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to load the saved report route.')
  }

  return payload.route
}
