/**
 * AppRoutes.jsx — Centralised Route Definitions
 *
 * All application URL routes are declared here in one place.
 * <AppLayout> acts as a "layout route" — it renders the sidebar
 * and top-bar once, then injects the active child page via <Outlet />.
 *
 * Route map:
 *   /             → DashboardPage   (overview stats & recent activity)
 *   /monitoring   → MonitoringPage  (live Leaflet map with GPS markers)
 *   /analytics    → AnalyticsPage   (data insights: weekly patrol vs incident chart)
 *   /assign-area  → AssignAreaPage  (deployment and patrol area assignments)
 *   /personnel    → PersonnelPage   (officer roster table)
 *   /reports      → ReportsPage     (data insights: filed patrol & incident reports)
 *   /settings     → SettingsPage    (system configuration)
 *   *             → redirect to /   (catch-all for unknown URLs)
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import AnalyticsPage from '../pages/AnalyticsPage'
import AssignAreaPage from '../pages/AssignAreaPage'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/LoginPage'
import MonitoringPage from '../pages/MonitoringPage'
import PersonnelPage from '../pages/PersonnelPage'
import ReportsPage from '../pages/ReportsPage'
import SettingsPage from '../pages/SettingsPage'

function AppRoutes() {
  return (
    <Routes>
      {/*
        AppLayout is the shared shell component.
        Every route nested inside it gets the sidebar + top-bar for free.
        The matched page component is rendered into AppLayout's <Outlet />.
      */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<MonitoringPage />} />
        <Route path="/monitoring" element={<DashboardPage/>} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/assign-area" element={<AssignAreaPage />} />
        <Route path="/personnel" element={<PersonnelPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="/login" element={<LoginPage />} />

      {/* Redirect any unrecognised path back to the dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
