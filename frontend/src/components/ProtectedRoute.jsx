import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthLoadingSkeleton } from './LoadingSkeleton'
import { PageCacheProvider } from '../context/PageCacheProvider'
import SessionRecovery from './SessionRecovery'

function ProtectedRoute() {
  const { loading, isAuthenticated, user, sessionError } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AuthLoadingSkeleton />
  }
  if (!isAuthenticated) {
    if (sessionError) return <SessionRecovery />
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return (
    <PageCacheProvider key={user?.id || user?._id || user?.username}>
      <Outlet />
    </PageCacheProvider>
  )
}

export default ProtectedRoute
