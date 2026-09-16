import { apiRequest } from './apiClient'

// Coverage must include every page of personnel and active deployments.
export const getPaginatedCollection = async (path, errorMessage) => {
  const rows = []
  let page = 1
  let totalPages = 1
  do {
    const payload = await apiRequest(`${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`, { errorMessage })
    rows.push(...(Array.isArray(payload.data) ? payload.data : []))
    totalPages = payload.pagination?.totalPages || 1
    page += 1
  } while (page <= totalPages)
  return rows
}
