/**
 * AppRoutes.jsx — Centralised Route Definitions
 *
 * All application URL routes are declared here in one place.
 * <AppLayout> acts as a "layout route" — it renders the sidebar
 * and top-bar once, then injects the active child page via <Outlet />.
 *
 * Route map:
 *   /             → MonitoringPage  (live MapLibre map with GPS markers)
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
import ProtectedRoute from '../components/ProtectedRoute'

const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage'))
const AssignAreaPage = lazy(() => import('../pages/AssignAreaPage'))
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const EvidenceViewerPage = lazy(() => import('../pages/EvidenceViewerPage'))
const LoginPage = lazy(() => import('../pages/LoginPage'))
const MonitoringPage = lazy(() => import('../pages/MonitoringPage'))
const PersonnelPage = lazy(() => import('../pages/PersonnelPage'))
const ReportsPage = lazy(() => import('../pages/ReportsPage'))
const SettingsPage = lazy(() => import('../pages/SettingsPage'))

const withPageLoader = (page) => (
  <Suspense fallback={<div className="route-page-loading" role="status">Loading page…</div>}>
    {page}
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
          <Route path="/" element={withPageLoader(<MonitoringPage />)} />
          <Route path="/monitoring" element={withPageLoader(<DashboardPage />)} />
          <Route path="/analytics" element={withPageLoader(<AnalyticsPage />)} />
          <Route path="/assign-area" element={withPageLoader(<AssignAreaPage key="deployment-form" />)} />
          <Route path="/deployments" element={withPageLoader(<AssignAreaPage key="deployment-list" view="list" />)} />
          <Route path="/personnel" element={withPageLoader(<PersonnelPage />)} />
          <Route path="/reports" element={withPageLoader(<ReportsPage />)} />
          <Route path="/settings" element={withPageLoader(<SettingsPage />)} />
        </Route>
      </Route>

      <Route element={<GuestOnlyRoute />}>
        <Route path="/login" element={withPageLoader(<LoginPage />)} />
      </Route>

      {/* Redirect any unrecognised path back to the dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
