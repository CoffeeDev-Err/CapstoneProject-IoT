import { AUTH_TOKEN_KEY } from './auth'
import { API_URL } from './runtime'

const request = async (path, options) => {
  const isMultipart = options?.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(!isMultipart ? { 'Content-Type': 'application/json' } : {}),
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

const createRequestBody = (account, profilePhoto) => {
  if (!profilePhoto) return JSON.stringify(account)

  const formData = new FormData()
  Object.entries(account).forEach(([field, value]) => {
    if (value !== undefined && value !== null) formData.append(field, String(value))
  })
  formData.append('profile_photo', profilePhoto)
  return formData
}

export const createAccount = async (account, profilePhoto) => {
  const payload = await request('/api/accounts', {
    method: 'POST',
    body: createRequestBody(account, profilePhoto),
  })
  return payload.account
}

export const updateAccount = async (accountId, account, profilePhoto) => {
  const payload = await request(`/api/accounts/${accountId}`, {
    method: 'PUT',
    body: createRequestBody(account, profilePhoto),
  })
  return payload.account
}

export const deactivateAccount = async (accountId) => (
  request(`/api/accounts/${accountId}`, { method: 'DELETE' })
)
