import { apiRequest } from './apiClient'
export { AUTH_TOKEN_KEY, AUTH_USER_KEY } from './sessionKeys'

const request = (path, options = {}) => apiRequest(path, { auth: false, ...options })

export const beginLogin = (username, password) => request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    username,
    password,
    application: 'web',
    device_name: navigator.userAgent,
  }),
})

export const verifyLoginCode = (challengeId, code) => request('/api/auth/login/verify', {
  method: 'POST',
  body: JSON.stringify({
    challenge_id: challengeId,
    code,
    device_name: navigator.userAgent,
  }),
})

export const resendVerificationCode = (challengeId) => request('/api/auth/verification/resend', {
  method: 'POST',
  body: JSON.stringify({
    challenge_id: challengeId,
    device_name: navigator.userAgent,
  }),
})

export const requestPasswordReset = (identifier) => request('/api/auth/password/forgot', {
  method: 'POST',
  body: JSON.stringify({
    identifier,
    device_name: navigator.userAgent,
  }),
})

export const resetPassword = (challengeId, code, newPassword) => (
  request('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      challenge_id: challengeId,
      code,
      new_password: newPassword,
    }),
  })
)

export const getCurrentUser = (token) => request('/api/auth/me', {
  headers: { Authorization: `Bearer ${token}` },
})

export const logoutSession = (token) => request('/api/auth/logout', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
})

export const requestPasswordChange = (token, currentPassword) => (
  request('/api/auth/password/change/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      current_password: currentPassword,
      device_name: navigator.userAgent,
    }),
  })
)

export const confirmPasswordChange = (token, challengeId, code, newPassword) => (
  request('/api/auth/password', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      challenge_id: challengeId,
      code,
      new_password: newPassword,
    }),
  })
)
