import { apiRequest } from './apiClient'

export const getPersonnel = async () => {
  const payload = await apiRequest('/api/personnel?limit=100')

  return Array.isArray(payload.data) ? payload.data : []
}

export const getPersonnelLocationHistory = async ({
  personnelId,
  from,
  to,
  limit = 500,
}) => {
  const query = new URLSearchParams({
    from,
    to,
    limit: String(limit),
  })
  const payload = await apiRequest(
    `/api/personnel/${encodeURIComponent(personnelId)}/location-history?${query}`,
  )

  return {
    points: Array.isArray(payload.data) ? payload.data : [],
    pagination: payload.pagination,
  }
}
