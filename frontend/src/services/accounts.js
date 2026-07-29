const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
import { AUTH_TOKEN_KEY } from './auth'

const request = async (path, options) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY) || ''}`,
      ...options?.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.message || 'Unable to complete the account request.')
    error.code = payload.code
    error.field = payload.field
    throw error
  }

  return payload
}

export const getAccounts = async () => {
  const payload = await request('/api/accounts')
  return Array.isArray(payload.accounts) ? payload.accounts : []
}

export const createAccount = async (account) => {
  const payload = await request('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(account),
  })
  return payload.account
}

export const updateAccount = async (accountId, account) => {
  const payload = await request(`/api/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify(account),
  })
  return payload.account
}

export const deactivateAccount = async (accountId) => (
  request(`/api/accounts/${accountId}`, { method: 'DELETE' })
)
