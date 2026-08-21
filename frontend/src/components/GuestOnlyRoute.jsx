import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function GuestOnlyRoute() {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return <div className="auth-loading-screen">Checking secure session...</div>
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default GuestOnlyRoute
