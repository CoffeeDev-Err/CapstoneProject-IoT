import { apiRequest } from './apiClient'

export const getAccounts = async () => {
  const payload = await apiRequest('/api/accounts')
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
  const payload = await apiRequest('/api/accounts', {
    method: 'POST',
    body: createRequestBody(account, profilePhoto),
  })
  return payload.account
}

export const updateAccount = async (accountId, account, profilePhoto) => {
  const payload = await apiRequest(`/api/accounts/${accountId}`, {
    method: 'PUT',
    body: createRequestBody(account, profilePhoto),
  })
  return payload.account
}

export const deactivateAccount = async (accountId) => (
  apiRequest(`/api/accounts/${accountId}`, { method: 'DELETE' })
)
