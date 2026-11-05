import { apiRequest } from './apiClient'
import { getPaginatedCollection } from './apiCollections'

export const getPersonnel = () => getPaginatedCollection('/api/personnel', 'Unable to load personnel.')

export const getDutyGpsHistory = ({ personnelId, date, deploymentId = '', view = 'hourly', hour = '', cursor = '', roadMatch = false, signal }) => {
  const query = new URLSearchParams({ date, view })
  if (deploymentId) query.set('deployment_id', deploymentId)
  if (hour !== '') query.set('hour', hour)
  if (cursor) query.set('cursor', cursor)
  if (roadMatch) query.set('road_match', 'true')
  return apiRequest(`/api/personnel/${encodeURIComponent(personnelId)}/gps-history?${query}`, { signal })
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
