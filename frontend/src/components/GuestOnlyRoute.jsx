import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthLoadingSkeleton } from './LoadingSkeleton'
import SessionRecovery from './SessionRecovery'

function GuestOnlyRoute() {
  const { loading, isAuthenticated, sessionError } = useAuth()

  if (loading) {
    return <AuthLoadingSkeleton />
  }

  if (isAuthenticated) {
    return <Navigate to="/map" replace />
  }

  if (sessionError) return <SessionRecovery />
  return <Outlet />
}

export default GuestOnlyRoute
