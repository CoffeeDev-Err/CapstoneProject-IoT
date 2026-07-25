const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const getRegisteredFlespiDevices = async ({ refresh = false } = {}) => {
  const query = refresh ? '?refresh=true' : ''
  const response = await fetch(`${API_URL}/api/flespi/devices${query}`)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.message || 'Unable to load registered GPS devices.')
    error.code = payload.code || 'FLESPI_REQUEST_FAILED'
    throw error
  }

  return Array.isArray(payload.devices) ? payload.devices : []
}
