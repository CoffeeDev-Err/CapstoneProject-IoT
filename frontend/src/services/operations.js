import { apiRequest } from './apiClient'

const getCollection = async (path, fallbackMessage) => {
  const payload = await apiRequest(path, { errorMessage: fallbackMessage })

  return Array.isArray(payload.data) ? payload.data : []
}

export const getReports = () => (
  getCollection('/api/reports?limit=100', 'Unable to load reports.')
)

export const getReportsPage = async ({
  page = 1,
  limit = 10,
  search = '',
  reportType = 'all',
  caseStatus = 'all',
  sortBy = 'submitted_at',
  sortOrder = 'desc',
  signal,
} = {}) => {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (search.trim()) query.set('search', search.trim())
  if (reportType !== 'all') query.set('report_type', reportType)
  if (caseStatus !== 'all') query.set('case_status', caseStatus)
  query.set('sort_by', sortBy)
  query.set('sort_order', sortOrder)

  const payload = await apiRequest(`/api/reports?${query}`, {
    signal,
    errorMessage: 'Unable to search reports.',
  })

  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    pagination: payload.pagination || {
      page,
      limit,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: page > 1,
    },
  }
}

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
