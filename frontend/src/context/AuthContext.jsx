import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  getCurrentUser,
  logoutSession,
} from '../services/auth'
import { AuthContext } from './AuthContextObject'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // The session token now lives in an httpOnly cookie the browser attaches
  // automatically, so we can never read it from JavaScript. Bootstrap therefore
  // always asks the server who the current user is.
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [checkingSession, setCheckingSession] = useState(false)
  const [verified, setVerified] = useState(false)
  const generation = useRef(0)
  const inFlight = useRef(null)

  useEffect(() => {
    // One-time migration cleanup for browsers that used an older build.
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
  }, [])

  const clearSession = useCallback(() => {
    generation.current += 1
    inFlight.current = null
    setVerified(false)
    setSessionError('')
    setCheckingSession(false)
    setLoading(false)
    // Both keys are removed to purge data left by older builds. Current web
    // sessions keep the token in an httpOnly cookie and the user only in memory.
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    setUser(null)
  }, [])

  const establishSession = useCallback((session) => {
    generation.current += 1
    inFlight.current = null
    setVerified(true)
    setSessionError('')
    setCheckingSession(false)
    setLoading(false)
    setUser(session.user)
  }, [])

  const logout = useCallback(async () => {
    clearSession()
    await logoutSession().catch(() => {})
  }, [clearSession])

  const refreshSession = useCallback(() => {
    if (inFlight.current) return inFlight.current
    const requestGeneration = generation.current
    setCheckingSession(true)
    const request = (async () => {
      try {
        const { user: currentUser } = await getCurrentUser()
        if (requestGeneration !== generation.current) return
        if (!currentUser?.id) throw new Error('Invalid session response')
        setVerified(true)
        setUser(currentUser)
        setSessionError('')
      } catch (error) {
        if (requestGeneration !== generation.current) return
        if ([401, 403].includes(error?.status)) clearSession()
        else setSessionError('Unable to verify your session. Check your connection and try again. The service may be temporarily unavailable.')
      } finally {
        if (requestGeneration === generation.current) {
          setLoading(false)
          setCheckingSession(false)
          inFlight.current = null
        }
      }
    })()
    inFlight.current = request
    return request
  }, [clearSession])

  useEffect(() => {
    void refreshSession()
    const refreshCurrentUser = () => { void refreshSession() }
    window.addEventListener('bantaycabagan:account-updated', refreshCurrentUser)
    return () => {
      generation.current += 1
      inFlight.current = null
      window.removeEventListener('bantaycabagan:account-updated', refreshCurrentUser)
    }
  }, [refreshSession])

  useEffect(() => {
    if (!sessionError) return undefined
    const retry = () => { if (navigator.onLine !== false) void refreshSession() }
    const timer = setInterval(retry, 15_000)
    window.addEventListener('online', retry)
    return () => { clearInterval(timer); window.removeEventListener('online', retry) }
  }, [refreshSession, sessionError])

  const value = useMemo(() => ({
    clearSession,
    establishSession,
    loading,
    logout,
    sessionError,
    checkingSession,
    refreshSession,
    user,
    isAuthenticated: Boolean(verified && user),
  }), [clearSession, establishSession, loading, logout, user, verified, sessionError, checkingSession, refreshSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
