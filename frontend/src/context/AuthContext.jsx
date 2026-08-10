import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  getCurrentUser,
  logoutSession,
} from '../services/auth'
import { AuthContext } from './AuthContextObject'

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY))
  const [user, setUser] = useState(readStoredUser)
  const [loading, setLoading] = useState(Boolean(token))

  const clearSession = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const establishSession = useCallback((session) => {
    localStorage.setItem(AUTH_TOKEN_KEY, session.token)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session.user))
    setToken(session.token)
    setUser(session.user)
  }, [])

  const logout = useCallback(async () => {
    const activeToken = localStorage.getItem(AUTH_TOKEN_KEY)
    clearSession()
    if (activeToken) await logoutSession(activeToken).catch(() => {})
  }, [clearSession])

  useEffect(() => {
    if (!token) return undefined
    const refreshCurrentUser = () => getCurrentUser(token)
      .then(({ user: currentUser }) => {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser))
        setUser(currentUser)
      })
      .catch(clearSession)
    refreshCurrentUser().finally(() => setLoading(false))
    window.addEventListener('bantaycabagan:account-updated', refreshCurrentUser)
    return () => window.removeEventListener('bantaycabagan:account-updated', refreshCurrentUser)
  }, [clearSession, token])

  const value = useMemo(() => ({
    clearSession,
    establishSession,
    loading,
    logout,
    token,
    user,
  }), [clearSession, establishSession, loading, logout, token, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
