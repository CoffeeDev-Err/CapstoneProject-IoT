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
  const [user, setUser] = useState(readStoredUser)
  // The session token now lives in an httpOnly cookie the browser attaches
  // automatically, so we can never read it from JavaScript. Bootstrap therefore
  // always asks the server who the current user is.
  const [loading, setLoading] = useState(true)

  const clearSession = useCallback(() => {
    // AUTH_TOKEN_KEY is only removed to purge any legacy token left behind by a
    // pre-cookie build; new sessions never write it.
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    setUser(null)
  }, [])

  const establishSession = useCallback((session) => {
    // The backend delivers the session as an httpOnly cookie; only the
    // non-sensitive user profile is cached locally for a fast first paint.
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session.user))
    setUser(session.user)
  }, [])

  const logout = useCallback(async () => {
    clearSession()
    await logoutSession().catch(() => {})
  }, [clearSession])

  useEffect(() => {
    const refreshCurrentUser = () => getCurrentUser()
      .then(({ user: currentUser }) => {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser))
        setUser(currentUser)
      })
      .catch(clearSession)
    refreshCurrentUser().finally(() => setLoading(false))
    window.addEventListener('bantaycabagan:account-updated', refreshCurrentUser)
    return () => window.removeEventListener('bantaycabagan:account-updated', refreshCurrentUser)
  }, [clearSession])

  const value = useMemo(() => ({
    clearSession,
    establishSession,
    loading,
    logout,
    user,
    isAuthenticated: Boolean(user),
  }), [clearSession, establishSession, loading, logout, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
