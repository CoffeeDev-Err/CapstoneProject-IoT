/**
 * TopBar.jsx — Sticky Header Bar
 *
 * Displayed at the top of every page inside AppLayout.
 * Left side  — compact page context and station identification
 * Right side — connection status pill, dark/light mode toggle,
 *              and notifications. Account actions live in the sidebar.
 *
 * Props:
 *   isConnected  {boolean}  — true when Socket.IO is connected
 *   isDark       {boolean}  — true when dark mode is active
 *   onToggleDark {Function} — called to flip the dark mode flag
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Menu,
  Moon,
  Sun,
} from 'lucide-react'
import { matchesPrefixSearch } from '../utils/searchMatching'
import { getNotificationDisplayMessage, getNotificationNavigationTarget } from '../utils/notificationNavigation'
import ConfirmModal from './ConfirmModal'

const NOTIFICATION_HISTORY_OPTIONS = [
  { value: 'all', label: 'Show All' },
  { value: 'today', label: 'Today' },
  { value: '7-days', label: '7 days' },
  { value: '30-days', label: '30 days' },
]

const isNotificationInHistoryRange = (notification, range) => {
  if (range === 'all') {
    return true
  }

  const notificationDate = new Date(notification.timestamp)
  if (Number.isNaN(notificationDate.getTime())) {
    return false
  }

  const now = new Date()

  if (range === 'today') {
    return notificationDate.getFullYear() === now.getFullYear()
      && notificationDate.getMonth() === now.getMonth()
      && notificationDate.getDate() === now.getDate()
  }

  const rangeInDays = range === '7-days' ? 7 : 30
  const rangeStart = new Date(now)
  rangeStart.setDate(rangeStart.getDate() - rangeInDays)

  return notificationDate >= rangeStart && notificationDate <= now
}

const getNotificationTypeLabel = (type) => {
  switch (type) {
    case 'geofence':
      return 'Geofence'
    case 'emergency':
      return 'Emergency'
    case 'warning':
      return 'Warning'
    case 'success':
      return 'Update'
    default:
      return 'System'
  }
}

const getNotificationTypeClass = (type) => {
  switch (type) {
    case 'geofence':
      return 'notification-type-pill--geofence'
    case 'emergency':
      return 'notification-type-pill--emergency'
    case 'warning':
      return 'notification-type-pill--warning'
    case 'success':
      return 'notification-type-pill--success'
    default:
      return 'notification-type-pill--system'
  }
}

const formatNotificationTimestamp = (isoValue) => {
  if (!isoValue) return 'Just now'

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoValue))
}

function TopBar({
  navigationOpen = false,
  onOpenNavigation,
  isConnected,
  isDark,
  onToggleDark,
  notifications = [],
  unreadNotificationCount = 0,
  onReadNotification,
  onReadAllNotifications,
  onClearNotifications,
  hasMoreNotifications = false,
  loadingAllNotifications = false,
  onShowAllNotifications,
}) {
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [notificationSearch, setNotificationSearch] = useState('')
  const deferredNotificationSearch = useDeferredValue(notificationSearch)
  const [notificationHistoryRange, setNotificationHistoryRange] = useState('all')
  const notificationRef = useRef(null)
  const notificationRequestSequenceRef = useRef(0)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const page = pathname.startsWith('/personnel/') ? ['Operations', 'Personnel GPS history'] : ({
    '/map': ['Overview', 'Live Map'], '/monitoring': ['Overview', 'Dashboard'],
    '/personnel': ['Operations', 'Personnel'], '/assign-area': ['Operations', 'Deployment Management'],
    '/deployments': ['Operations', 'Assigned Deployments'], '/analytics': ['Analytics', 'Analytics'],
    '/reports': ['Analytics', 'Reports'], '/settings': ['Admin', 'Account Management'],
  }[pathname] || ['GeoSentri', 'Operations portal'])

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (!isNotificationInHistoryRange(notification, notificationHistoryRange)) {
        return false
      }

      const typeAliases = []
      if (notification.type === 'emergency') {
        typeAliases.push('backup', 'request', 'backup request', 'emergency')
      }
      if (notification.type === 'geofence') {
        typeAliases.push('outside', 'boundary', 'outside boundary', 'geofence', 'cabagan')
      }

      const searchableTimestamp = formatNotificationTimestamp(notification.timestamp).toLowerCase()
      return matchesPrefixSearch(deferredNotificationSearch, [
        notification.title,
        notification.message,
        notification.type,
        typeAliases.join(' '),
        searchableTimestamp,
      ])
    })
  }, [deferredNotificationSearch, notificationHistoryRange, notifications])

  // Close open top-bar popovers whenever user clicks outside of them
  useEffect(() => {
    if (!notificationOpen) return

    const handler = (e) => {
      if (!notificationRef.current?.contains(e.target)) setNotificationOpen(false)
    }

    document.addEventListener('mousedown', handler)
    document.addEventListener('focusin', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('focusin', handler)
    }
  }, [notificationOpen])

  const toggleNotificationDropdown = () => {
    const nextOpen = !notificationOpen

    setNotificationOpen(nextOpen)

    if (nextOpen) {
      onReadAllNotifications?.()
      if (notificationHistoryRange === 'all') onShowAllNotifications?.()
    }
  }

  const handleRequestClearNotifications = () => {
    if (notifications.length === 0) {
      return
    }

    setClearConfirmOpen(true)
  }

  const handleConfirmClearNotifications = () => {
    onClearNotifications?.()
    setClearConfirmOpen(false)
    setNotificationOpen(false)
  }

  const handleCancelClearNotifications = () => {
    setClearConfirmOpen(false)
  }

  const handleOpenNotification = (notification) => {
    notificationRequestSequenceRef.current += 1
    onReadNotification?.(notification.id)
    const target = getNotificationNavigationTarget(notification)
    if (!target) return
    setNotificationOpen(false)
    navigate(target.pathname, {
      state: {
        ...target.state,
        notificationRequestId: `${notification.id}-${notificationRequestSequenceRef.current}`,
      },
    })
  }

  return (
    <header className="top-bar">
      {/* ── Left: system branding ── */}
      <div className="topbar-left">
        <button type="button" className="icon-btn mobile-menu-button"
          aria-label="Open navigation" aria-expanded={navigationOpen}
          aria-controls="mobile-navigation" onClick={onOpenNavigation}>
          <Menu aria-hidden="true" />
        </button>
        <div className="topbar-left__copy">
          <div className="topbar-context"><strong title={page[1]}>{page[1]}</strong></div>
          <p>Cabagan Police Station <span aria-hidden="true">·</span> Philippine National Police</p>
        </div>
      </div>

      {/* ── Right: status pill + theme + notifications + supervisor profile ── */}
      <div className="topbar-right d-flex align-items-center gap-2 flex-shrink-0">
        {/* Live / Offline indicator */}
        <span className={`connection-pill ${isConnected ? 'online' : 'offline'}`}>
          {isConnected ? 'Live' : 'Offline'}
        </span>

        {/* Dark / Light mode toggle */}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>

        {/* Notifications — appears before profile and shows an unread blue dot */}
        <div className="notification-wrapper" ref={notificationRef}>
          <button
            type="button"
            className={`icon-btn notification-btn ${unreadNotificationCount > 0 ? 'has-unread' : ''}`}
            onClick={toggleNotificationDropdown}
            aria-label="Open notifications"
            aria-expanded={notificationOpen}
            aria-haspopup="true"
            title="Notifications"
          >
            <Bell aria-hidden="true" />
            {unreadNotificationCount > 0 && <span className="notification-dot" aria-hidden="true" />}
          </button>

          {notificationOpen && (
            <div className="notification-dropdown">
              <div className="notification-dropdown__header">
                <div>
                  <strong>Notifications</strong>
                  <small>{loadingAllNotifications
                    ? `Loading history · ${notifications.length} loaded`
                    : `${filteredNotifications.length} of ${notifications.length}${hasMoreNotifications ? '+' : ''} shown`}</small>
                </div>
                <div className="notification-dropdown__actions">
                  <button type="button" onClick={onReadAllNotifications} disabled={notifications.length === 0}>
                    Mark all read
                  </button>
                  <button type="button" onClick={handleRequestClearNotifications} disabled={notifications.length === 0}>
                    Clear
                  </button>
                </div>
              </div>

              <div className="notification-search">
                <input
                  type="search"
                  value={notificationSearch}
                  onChange={(e) => setNotificationSearch(e.target.value)}
                  placeholder="Search backup, outside boundary, personnel name, or date"
                  aria-label="Search notifications"
                />
              </div>

              <div className="notification-history-filter" aria-label="Notification history">
                <span>History</span>
                <div className="notification-history-filter__options">
                  {NOTIFICATION_HISTORY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={notificationHistoryRange === option.value ? 'is-active' : ''}
                      onClick={() => {
                        setNotificationHistoryRange(option.value)
                        if (option.value === 'all') onShowAllNotifications?.()
                      }}
                      aria-pressed={notificationHistoryRange === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {notifications.length === 0 ? (
                <div className="notification-empty-state">
                  <strong>No notifications yet</strong>
                  <p className="mb-0">Geofence alerts and system updates will appear here.</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="notification-empty-state">
                  <strong>No matched notifications</strong>
                  <p className="mb-0">Try another keyword or expand the history range.</p>
                </div>
              ) : (
                <ul className="notification-list">
                  {filteredNotifications.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={`notification-item ${notification.isRead ? '' : 'notification-item--unread'}`}
                        onClick={() => handleOpenNotification(notification)}
                      >
                        <div className="notification-item__meta">
                          <span className={`notification-type-pill ${getNotificationTypeClass(notification.type)}`}>
                            {getNotificationTypeLabel(notification.type)}
                          </span>
                          <small>{formatNotificationTimestamp(notification.timestamp)}</small>
                        </div>
                        <strong className="notification-item__title">{notification.title}</strong>
                        <p className="notification-item__message mb-0">{getNotificationDisplayMessage(notification)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>


      </div>

      <ConfirmModal
        open={clearConfirmOpen}
        title="Clear Notifications?"
        message="This will remove all notifications from the list."
        confirmLabel="Clear"
        cancelLabel="Cancel"
        onConfirm={handleConfirmClearNotifications}
        onCancel={handleCancelClearNotifications}
        variant="primary"
      />
    </header>
  )
}

export default TopBar
