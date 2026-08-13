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
import ProtectedRoute from '../components/ProtectedRoute'
import AnalyticsPage from '../pages/AnalyticsPage'
import AssignAreaPage from '../pages/AssignAreaPage'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/LoginPage'
import PersonnelPage from '../pages/PersonnelPage'
import SettingsPage from '../pages/SettingsPage'

const MonitoringPage = lazy(() => import('../pages/MonitoringPage'))
const ReportsPage = lazy(() => import('../pages/ReportsPage'))

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
        <Route element={<AppLayout />}>
          <Route path="/" element={withPageLoader(<MonitoringPage />)} />
          <Route path="/monitoring" element={<DashboardPage/>} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/assign-area" element={<AssignAreaPage />} />
          <Route path="/personnel" element={<PersonnelPage />} />
          <Route path="/reports" element={withPageLoader(<ReportsPage />)} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/login" element={<LoginPage />} />

      {/* Redirect any unrecognised path back to the dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
