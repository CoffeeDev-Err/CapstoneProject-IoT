const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const replaceDeployments = async (assignments) => {
  const response = await fetch(`${API_URL}/api/deployments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments }),
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.message || 'Unable to save deployment assignments.')
  }

  return payload.deployments
}
