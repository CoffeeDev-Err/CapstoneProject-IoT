// Shared promises let navigation reuse code already requested by prefetch.
export function createRouteLoader(importPage) {
  let pending
  return () => {
    if (!pending) {
      pending = importPage().catch((error) => {
        pending = undefined
        throw error
      })
    }
    return pending
  }
}

export const routeLoaders = {
  analytics: createRouteLoader(() => import('../pages/AnalyticsPage')),
  deployments: createRouteLoader(() => import('../pages/AssignAreaPage')),
  dashboard: createRouteLoader(() => import('../pages/DashboardPage')),
  evidence: createRouteLoader(() => import('../pages/EvidenceViewerPage')),
  login: createRouteLoader(() => import('../pages/LoginPage')),
  map: createRouteLoader(() => import('../pages/MonitoringPage')),
  personnel: createRouteLoader(() => import('../pages/PersonnelPage')),
  reports: createRouteLoader(() => import('../pages/ReportsPage')),
  gpsHistory: createRouteLoader(() => import('../pages/PersonnelGpsHistoryPage')),
  settings: createRouteLoader(() => import('../pages/SettingsPage')),
}

const navigationLoaders = {
  '/map': routeLoaders.map,
  '/monitoring': routeLoaders.dashboard,
  '/analytics': routeLoaders.analytics,
  '/personnel': routeLoaders.personnel,
  '/reports': routeLoaders.reports,
  '/assign-area': routeLoaders.deployments,
  '/deployments': routeLoaders.deployments,
  '/settings': routeLoaders.settings,
}

export function prefetchRoute(path) {
  // A failed speculative request must not interrupt the current page.
  return navigationLoaders[path]?.().catch(() => undefined)
}

export function scheduleRoutePreloads({
  host = window,
  connection = navigator.connection,
  loaders = [routeLoaders.personnel, routeLoaders.reports, routeLoaders.dashboard],
} = {}) {
  let cancelled = false
  let handle
  const useIdle = typeof host.requestIdleCallback === 'function'
  const restricted = () => connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)
  const queue = [...loaders]
  const schedule = () => {
    if (cancelled || restricted() || !queue.length) return
    handle = useIdle ? host.requestIdleCallback(run) : host.setTimeout(run, 1000)
  }
  const run = async () => {
    if (cancelled || restricted()) return
    try { await queue.shift()() } catch { /* Retry on navigation intent. */ }
    schedule()
  }
  schedule()
  return () => {
    cancelled = true
    if (useIdle) host.cancelIdleCallback(handle)
    else host.clearTimeout(handle)
  }
}
