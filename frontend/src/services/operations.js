import { apiRequest } from './apiClient'
import { getPaginatedCollection } from './apiCollections'

const getCollection = async (path, fallbackMessage) => {
  const payload = await apiRequest(path, { errorMessage: fallbackMessage })

  return Array.isArray(payload.data) ? payload.data : []
}

export const getReports = () => getCollection('/api/reports?limit=100', 'Unable to load reports.')

export const getReportsPage = async ({
  page = 1,
  limit = 10,
  search = '',
  reportType = 'all',
  caseStatus = 'all',
  validationStatus = 'all', category = 'all', barangay = 'all', from, to, cabaganOnly = false,
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
  if (validationStatus !== 'all') query.set('validation_status', validationStatus)
  if (category !== 'all') query.set('category', category)
  if (barangay !== 'all') query.set('barangay', barangay)
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  if (cabaganOnly) query.set('scope', 'cabagan')
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

export const getReportsList = async (options = {}) => {
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 100))
  const firstPage = await getReportsPage({ ...options, page: 1, limit })
  const remainingPageNumbers = Array.from(
    { length: Math.max(0, firstPage.pagination.totalPages - 1) },
    (_, index) => index + 2,
  )
  const remainingPages = await Promise.all(
    remainingPageNumbers.map((page) => getReportsPage({ ...options, page, limit })),
  )
  const data = [firstPage, ...remainingPages].flatMap((result) => result.data)

  return {
    data,
    pagination: {
      ...firstPage.pagination,
      page: 1,
      limit: data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
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
  getPaginatedCollection('/api/deployments', 'Unable to load deployments.')
)

export const getTasks = () => (
  getCollection('/api/tasks?view=active&limit=100', 'Unable to load active operations.')
)

export const getTask = async (taskId) => {
  const payload = await apiRequest(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    { errorMessage: 'Unable to load the backup request.' },
  )
  return payload.task
}

export const completeTask = async (taskId) => {
  const payload = await apiRequest(
    `/api/tasks/${encodeURIComponent(taskId)}/complete`,
    { method: 'PATCH', errorMessage: 'Unable to complete the backup request.' },
  )
  return payload.task
}

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

export const updateReportValidation = async (reportId, validationStatus, revision) => {
  const payload = await apiRequest(
    `/api/reports/${encodeURIComponent(reportId)}/validation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ validation_status: validationStatus, revision }),
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
