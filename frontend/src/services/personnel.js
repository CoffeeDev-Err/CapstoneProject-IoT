import { apiRequest } from './apiClient'
import { getPaginatedCollection } from './apiCollections'

export const getPersonnel = () => getPaginatedCollection('/api/personnel', 'Unable to load personnel.')

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
