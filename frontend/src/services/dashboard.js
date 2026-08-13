import { apiRequest } from './apiClient'

export const getDashboardSummary = async () => {
  return apiRequest('/api/dashboard/summary')
}
