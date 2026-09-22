import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthLoadingSkeleton } from './LoadingSkeleton'
import { PageCacheProvider } from '../context/PageCacheProvider'
import SessionRecovery from './SessionRecovery'
import PasswordChangeModal from './PasswordChangeModal'

function ProtectedRoute() {
  const { clearSession, loading, logout, isAuthenticated, user, sessionError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (loading) {
    return <AuthLoadingSkeleton />
  }
  if (!isAuthenticated) {
    if (sessionError) return <SessionRecovery />
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
	if (user?.forcePasswordReset) {
		return <div className="auth-required-screen">
			<PasswordChangeModal open required onClose={() => {}} onChanged={() => {
				clearSession()
				navigate('/login', { replace: true, state: { passwordChanged: true } })
			}} onSignOut={async () => { await logout(); navigate('/login', { replace: true }) }} />
		</div>
	}
  return (
    <PageCacheProvider key={user?.id || user?._id || user?.username}>
      <Outlet />
    </PageCacheProvider>
  )
}

export default ProtectedRoute
