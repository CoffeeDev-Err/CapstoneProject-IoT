const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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
  const response = await fetch(
    `${API_URL}/api/personnel/${encodeURIComponent(personnelId)}/location-history?${query}`,
  )
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to load officer route history.')
  }

  return {
    points: Array.isArray(payload.data) ? payload.data : [],
    pagination: payload.pagination,
  }
}
