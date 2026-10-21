import { useEffect } from 'react'
import { useAuth } from '../context/useAuth'
import { scheduleRoutePreloads } from './routeLoaders'

// Mounted inside Suspense: preload only after the requested page is ready.
export default function RoutePreloader() {
  const { isAuthenticated } = useAuth()
  useEffect(() => {
    if (isAuthenticated) return scheduleRoutePreloads()
    return undefined
  }, [isAuthenticated])
  return null
}
