import { apiRequest } from './apiClient'

const getCollection = async (path, fallbackMessage) => {
  const payload = await apiRequest(path, { errorMessage: fallbackMessage })

  return Array.isArray(payload.data) ? payload.data : []
}

export const getReports = () => (
  getCollection('/api/reports?limit=100', 'Unable to load reports.')
)

export const getReport = async (reportId) => {
  const payload = await apiRequest(
    `/api/reports/${encodeURIComponent(reportId)}`,
    { errorMessage: 'Unable to load the report evidence.' },
  )
  return payload.report
}

export const getDeployments = () => (
  getCollection('/api/deployments?limit=100', 'Unable to load deployments.')
)

export const getTasks = () => (
  getCollection('/api/tasks?view=active&limit=100', 'Unable to load active operations.')
)

export const getManageableDeployments = () => (
  getCollection(
    '/api/deployments?view=manageable&limit=100',
    'Unable to load current and scheduled deployments.',
  )
)

export const replaceDeployments = async (assignments) => {
  const payload = await apiRequest('/api/deployments', {
    method: 'PUT',
    body: JSON.stringify({ assignments }),
  })
  return payload.deployments
}

export const updateReportValidation = async (reportId, validationStatus) => {
  const payload = await apiRequest(
    `/api/reports/${encodeURIComponent(reportId)}/validation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ validation_status: validationStatus }),
    },
  )
  return payload.report
}

export const getReportRoute = async (reportId) => {
  const payload = await apiRequest(
    `/api/reports/${encodeURIComponent(reportId)}/route`,
  )
  return payload.route
}
