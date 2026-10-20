import { Navigate, Outlet } from 'react-router-dom'
import { AuthLoadingSkeleton } from './LoadingSkeleton'
import { useAuth } from '../context/useAuth'

function GuestOnlyRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <AuthLoadingSkeleton />
  }

  if (isAuthenticated) {
    return <Navigate to="/map" replace />
  }

  return <Outlet />
}

export default GuestOnlyRoute
