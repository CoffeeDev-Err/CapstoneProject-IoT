import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function ProtectedRoute() {
  const { loading, token } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="auth-loading-screen">Checking secure session...</div>
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

export default ProtectedRoute
