/**
 * AppRoutes.jsx — Centralised Route Definitions
 *
 * All application URL routes are declared here in one place.
 * <AppLayout> acts as a "layout route" — it renders the sidebar
 * and top-bar once, then injects the active child page via <Outlet />.
 *
 * Route map:
 *   /, /login     → LoginPage       (authorized personnel sign-in)
 *   /map          → MonitoringPage  (live MapLibre map with GPS markers)
 *   /monitoring   → DashboardPage   (overview stats & recent activity)
 *   /analytics    → AnalyticsPage   (data insights: weekly patrol vs incident chart)
 *   /assign-area  → AssignAreaPage  (deployment and patrol area assignments)
 *   /personnel    → PersonnelPage   (officer roster table)
 *   /reports      → ReportsPage     (data insights: filed patrol & incident reports)
 *   /settings     → SettingsPage    (system configuration)
 *   *             → redirect to /   (catch-all for unknown URLs)
 */
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import GuestOnlyRoute from '../components/GuestOnlyRoute'
import { AuthLoadingSkeleton, PageLoadingSkeleton } from '../components/LoadingSkeleton'
import ProtectedRoute from '../components/ProtectedRoute'
import { routeLoaders } from './routeLoaders'
import RoutePreloader from './RoutePreloader'

const AnalyticsPage = lazy(routeLoaders.analytics)
const AssignAreaPage = lazy(routeLoaders.deployments)
const DashboardPage = lazy(routeLoaders.dashboard)
const EvidenceViewerPage = lazy(routeLoaders.evidence)
const LoginPage = lazy(routeLoaders.login)
const MonitoringPage = lazy(routeLoaders.map)
const PersonnelPage = lazy(routeLoaders.personnel)
const ReportsPage = lazy(routeLoaders.reports)
const ReportGpsHistoryPage = lazy(routeLoaders.gpsHistory)
const SettingsPage = lazy(routeLoaders.settings)

const withPageLoader = (page, fallback = <PageLoadingSkeleton />) => (
  <Suspense fallback={fallback}>
    {page}
    <RoutePreloader />
  </Suspense>
)

function AppRoutes() {
  return (
    <Routes>
      {/*
        AppLayout is the shared shell component.
        Every route nested inside it gets the sidebar + top-bar for free.
        The matched page component is rendered into AppLayout's <Outlet />.
      */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/reports/:reportId/evidence"
          element={withPageLoader(<EvidenceViewerPage />)}
        />
        <Route element={<AppLayout />}>
          <Route path="/map" element={withPageLoader(<MonitoringPage />)} />
          <Route path="/monitoring" element={withPageLoader(<DashboardPage />)} />
          <Route path="/analytics" element={withPageLoader(<AnalyticsPage />)} />
          <Route path="/assign-area" element={withPageLoader(<AssignAreaPage key="deployment-form" />)} />
          <Route path="/deployments" element={withPageLoader(<AssignAreaPage key="deployment-list" view="list" />)} />
          <Route path="/personnel" element={withPageLoader(<PersonnelPage />)} />
          <Route path="/reports" element={withPageLoader(<ReportsPage />)} />
          <Route path="/reports/:reportId/gps-history" element={withPageLoader(<ReportGpsHistoryPage />)} />
          <Route path="/settings" element={withPageLoader(<SettingsPage />)} />
        </Route>
      </Route>

      <Route element={<GuestOnlyRoute />}>
        <Route path="/" element={withPageLoader(<LoginPage />, <AuthLoadingSkeleton />)} />
        <Route path="/login" element={withPageLoader(<LoginPage />, <AuthLoadingSkeleton />)} />
      </Route>

      {/* Redirect any unrecognised path back to the dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
