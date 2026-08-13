import { apiRequest } from './apiClient'

export const getRegisteredFlespiDevices = async ({ refresh = false } = {}) => {
  const query = refresh ? '?refresh=true' : ''
  const payload = await apiRequest(`/api/flespi/devices${query}`)

  return Array.isArray(payload.devices) ? payload.devices : []
}
