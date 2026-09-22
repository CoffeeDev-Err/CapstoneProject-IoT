/**
 * AppLayout.jsx — Shared Page Shell
 *
 * This component is the layout wrapper rendered by every route in the app.
 * It provides the navigation sidebar and the sticky top bar, then injects
 * the current page into React Router's <Outlet /> placeholder.
 *
 * Visual structure:
 *   
 *     NavSidebar   TopBar (sticky, always visible)
 *      (fixed)  
 *                  <Outlet /> — active page here    
 *   
 *
 * The `collapsed` state toggles the sidebar between:
 *   - Full width  (220 px) — shows icon + label
 *   - Icon-only   ( 64 px) — shows icon only, saves horizontal space
 *
 * `isConnected` is read from PersonnelContext so the TopBar live-status
 * pill stays accurate without needing extra prop-passing.
 */
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { usePersonnelContext } from '../context/usePersonnelContext'
import NavSidebar from './NavSidebar'
import MobileNavigation from './MobileNavigation'
import TopBar from './TopBar'
import SystemStatusBanner from './SystemStatusBanner'

function AppLayout() {
  // Controls whether sidebar is expanded (220 px) or icon-only (64 px)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  // Dark mode — initialised from localStorage so the preference persists
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light')

  // Apply / remove [data-theme="dark"] on <html> whenever isDark changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Pull the live connection flag from shared context to pass to TopBar
  const {
    isConnected,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsRead,
    clearNotifications,
  } = usePersonnelContext()

  return (
    // Adding layout-root--collapsed shifts the body margin to match icon-only width
    <div className={`layout-root ${collapsed ? 'layout-root--collapsed' : ''}`}>
      {/* Fixed-position sidebar — toggle button inside flips the collapsed state */}
      <NavSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <MobileNavigation open={mobileNavigationOpen} onClose={() => setMobileNavigationOpen(false)} />

      {/* Scrollable body area — left margin adjusts automatically via CSS transition */}
      <div className="layout-body">
        {/* Sticky top bar — shows system title and live/offline connection pill */}
        <TopBar
          navigationOpen={mobileNavigationOpen}
          onOpenNavigation={() => setMobileNavigationOpen(true)}
          isConnected={isConnected}
          isDark={isDark}
          onToggleDark={() => setIsDark((v) => !v)}
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
          onReadNotification={markNotificationAsRead}
          onReadAllNotifications={markAllNotificationsRead}
          onClearNotifications={clearNotifications}
        />

        {/* React Router renders the matched child page component here */}
        <SystemStatusBanner />
        <Outlet />
      </div>
    </div>
  )
}

export default AppLayout
