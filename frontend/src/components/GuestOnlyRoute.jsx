import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function GuestOnlyRoute() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/map" replace />
  }

  return <Outlet />
}

export default GuestOnlyRoute
