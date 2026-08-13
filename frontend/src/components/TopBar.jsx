/**
 * TopBar.jsx — Sticky Header Bar
 *
 * Displayed at the top of every page inside AppLayout.
 * Left side  — system branding (title + subtitle)
 * Right side — connection status pill, dark/light mode toggle,
 *              and the supervisor account button with dropdown menu.
 *
 * Props:
 *   isConnected  {boolean}  — true when Socket.IO is connected
 *   isDark       {boolean}  — true when dark mode is active
 *   onToggleDark {Function} — called to flip the dark mode flag
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  LogOut,
  Moon,
  Sun,
  UserRoundKey,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { resolveApiAssetUrl } from '../services/apiAssets'
import ConfirmModal from './ConfirmModal'
import PasswordChangeModal from './PasswordChangeModal'

/** Hardcoded supervisor — replace with an auth context in production */
const SUPERVISOR_FALLBACK = {
  name: 'Sgt. Leo Gannad',
  rank: 'Police Sergeant',
  role: 'Supervisor',
  photoUrl: 'https://randomuser.me/api/portraits/men/56.jpg',
}

const NOTIFICATION_HISTORY_OPTIONS = [
  { value: 'all', label: 'All' },
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
  isConnected,
  isDark,
  onToggleDark,
  notifications = [],
  unreadNotificationCount = 0,
  onReadNotification,
  onReadAllNotifications,
  onClearNotifications,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [notificationSearch, setNotificationSearch] = useState('')
  const [notificationHistoryRange, setNotificationHistoryRange] = useState('all')
  const dropdownRef = useRef(null)
  const notificationRef = useRef(null)
  const navigate = useNavigate()
  const { clearSession, logout, token, user } = useAuth()
  const supervisor = {
    name: user?.profile?.fullName || user?.name || SUPERVISOR_FALLBACK.name,
    rank: user?.profile?.rank || SUPERVISOR_FALLBACK.rank,
    role: user?.role === 'supervisor' ? 'Supervisor' : 'Officer',
    photoUrl: resolveApiAssetUrl(user?.photoUrl || user?.profile?.photoUrl) || SUPERVISOR_FALLBACK.photoUrl,
  }

  const handleLogout = async () => {
    setDropdownOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const handlePasswordChanged = () => {
    clearSession()
    navigate('/login', {
      replace: true,
      state: { passwordChanged: true },
    })
  }

  const filteredNotifications = useMemo(() => {
    const searchQuery = notificationSearch.trim().toLowerCase()
    const searchTokens = searchQuery.split(/\s+/).filter(Boolean)

    return notifications.filter((notification) => {
      if (!isNotificationInHistoryRange(notification, notificationHistoryRange)) {
        return false
      }

      if (searchTokens.length === 0) {
        return true
      }

      const typeAliases = []
      if (notification.type === 'emergency') {
        typeAliases.push('backup', 'request', 'backup request', 'emergency')
      }
      if (notification.type === 'geofence') {
        typeAliases.push('outside', 'boundary', 'outside boundary', 'geofence', 'cabagan')
      }

      const searchableTimestamp = formatNotificationTimestamp(notification.timestamp).toLowerCase()
      const searchableText = [
        notification.title,
        notification.message,
        notification.type,
        typeAliases.join(' '),
        searchableTimestamp,
      ]
        .join(' ')
        .toLowerCase()

      return searchTokens.every((token) => searchableText.includes(token))
    })
  }, [notificationHistoryRange, notificationSearch, notifications])

  // Close open top-bar popovers whenever user clicks outside of them
  useEffect(() => {
    if (!dropdownOpen && !notificationOpen) return

    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false)
      if (!notificationRef.current?.contains(e.target)) setNotificationOpen(false)
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen, notificationOpen])

  const toggleNotificationDropdown = () => {
    const nextOpen = !notificationOpen

    setNotificationOpen(nextOpen)

    if (nextOpen) {
      onReadAllNotifications?.()
      setDropdownOpen(false)
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

  return (
    <header className="top-bar">
      {/* ── Left: system branding ── */}
      <div className="topbar-left">
        <h1>Philippine National Police</h1>
        <p>Cabagan Police Station Operations Portal</p>
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
                  <small>{filteredNotifications.length} of {notifications.length} shown</small>
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
                      onClick={() => setNotificationHistoryRange(option.value)}
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
                        onClick={() => onReadNotification?.(notification.id)}
                      >
                        <div className="notification-item__meta">
                          <span className={`notification-type-pill ${getNotificationTypeClass(notification.type)}`}>
                            {getNotificationTypeLabel(notification.type)}
                          </span>
                          <small>{formatNotificationTimestamp(notification.timestamp)}</small>
                        </div>
                        <strong className="notification-item__title">{notification.title}</strong>
                        <p className="notification-item__message mb-0">{notification.message}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Supervisor account — photo + name + role, opens dropdown on click */}
        <div className="supervisor-profile" ref={dropdownRef}>
          <button
            type="button"
            className="supervisor-btn"
            onClick={() => {
              setDropdownOpen((v) => !v)
              setNotificationOpen(false)
            }}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <img
              src={supervisor.photoUrl}
              alt={supervisor.name}
              className="supervisor-avatar"
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(supervisor.name)}&background=1d4ed8&color=fff&size=64`
              }}
            />
            <div className="supervisor-info d-flex flex-column align-items-start">
              <span className="supervisor-name">{supervisor.name}</span>
              <span className="supervisor-role mt-1">{supervisor.role}</span>
            </div>
            <ChevronDown className="supervisor-chevron" aria-hidden="true" />
          </button>

          {/* Dropdown menu — appears below the button */}
          {dropdownOpen && (
            <div className="supervisor-dropdown">
              {/* Header row with larger photo + name + rank */}
              <div className="dropdown-profile-header d-flex align-items-center">
                <img
                  src={supervisor.photoUrl}
                  alt={supervisor.name}
                  className="dropdown-avatar"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(supervisor.name)}&background=1d4ed8&color=fff&size=64`
                  }}
                />
                <div>
                  <strong className="dropdown-name">{supervisor.name}</strong>
                  <span className="dropdown-rank mt-1">{supervisor.rank}</span>
                </div>
              </div>

              <div className="dropdown-divider" />

              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setDropdownOpen(false)
                  setPasswordModalOpen(true)
                }}
              >
                <UserRoundKey aria-hidden="true" />
                Change Password
              </button>
              <div className="dropdown-divider" />

              <button type="button" className="dropdown-item dropdown-item--logout" onClick={handleLogout}>
                <LogOut aria-hidden="true" />
                Log Out
              </button>
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
      <PasswordChangeModal
        open={passwordModalOpen}
        token={token}
        onClose={() => setPasswordModalOpen(false)}
        onChanged={handlePasswordChanged}
      />
    </header>
  )
}

export default TopBar
