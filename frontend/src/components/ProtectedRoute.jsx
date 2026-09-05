import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthLoadingSkeleton } from './LoadingSkeleton'
import { PageCacheProvider } from '../context/PageCacheProvider'

function ProtectedRoute() {
  const { loading, isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AuthLoadingSkeleton />
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return (
    <PageCacheProvider key={user?.id || user?._id || user?.username}>
      <Outlet />
    </PageCacheProvider>
  )
}

export default ProtectedRoute
