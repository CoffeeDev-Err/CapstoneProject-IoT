import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthLoadingSkeleton } from './LoadingSkeleton'

function GuestOnlyRoute() {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return <AuthLoadingSkeleton />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default GuestOnlyRoute
