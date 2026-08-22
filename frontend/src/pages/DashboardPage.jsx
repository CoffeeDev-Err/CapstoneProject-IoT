import { useEffect, useMemo, useState } from 'react'
import { useFeedback } from '../context/useFeedback'
import { DashboardContentSkeleton } from '../components/LoadingSkeleton'
import { getDashboardSummary } from '../services/dashboard'
import { socket } from '../services/socket'

const initialSummary = {
  totalPersonnel: 0,
  activePersonnel: 0,
  openTasks: 0,
  reportsToday: 0,
  openIncidents: 0,
  recentActivity: [],
  coverage: [],
  generatedAt: '',
}

const formatActivityTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function DashboardPage() {
  const [summary, setSummary] = useState(initialSummary)
  const [loadMessage, setLoadMessage] = useState('Loading live operational summary...')
  const { showFeedback } = useFeedback()

  useEffect(() => {
    let refreshTimer
    let active = true

    const loadSummary = () => getDashboardSummary()
      .then((payload) => {
        if (!active) return
        setSummary({ ...initialSummary, ...payload })
        setLoadMessage('')
      })
      .catch((error) => {
        if (!active) return
        setLoadMessage('')
        showFeedback(error.message || 'Unable to load the dashboard summary.', {
          type: 'error',
          title: 'Dashboard unavailable',
        })
      })

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(loadSummary, 120)
    }

    const refreshEvents = [
      'dashboard:updated',
      'accounts:updated',
      'personnel:update',
      'task:created',
      'task:updated',
      'report:submitted',
      'report:resolved',
      'report:updated',
      'deployments:updated',
    ]

    loadSummary()
    refreshEvents.forEach((eventName) => socket.on(eventName, scheduleRefresh))

    return () => {
      active = false
      clearTimeout(refreshTimer)
      refreshEvents.forEach((eventName) => socket.off(eventName, scheduleRefresh))
    }
  }, [showFeedback])

  const stats = useMemo(() => [
    {
      label: 'Personnel On Field',
      value: summary.activePersonnel,
      subtext: `${summary.totalPersonnel} active personnel accounts`,
      signal: 'Live',
      tone: 'live',
    },
    {
      label: 'Open Response Tasks',
      value: summary.openTasks,
      subtext: 'Backup and urgent requests',
      signal: summary.openTasks > 0 ? 'Action needed' : 'Clear',
      tone: summary.openTasks > 0 ? 'urgent' : 'clear',
    },
    {
      label: 'Reports Today',
      value: summary.reportsToday,
      subtext: 'Submitted from the mobile app',
      signal: 'Today',
      tone: 'info',
    },
    {
      label: 'Open Incidents',
      value: summary.openIncidents,
      subtext: 'Incident reports awaiting resolution',
      signal: summary.openIncidents > 0 ? 'Review' : 'Clear',
      tone: summary.openIncidents > 0 ? 'warning' : 'clear',
    },
  ], [summary])

  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header dashboard-page-header mb-4">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Overview of today&apos;s field operations</p>
        </div>
        {summary.generatedAt && (
          <time className="dashboard-updated-at" dateTime={summary.generatedAt}>
            Updated {new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(summary.generatedAt))}
          </time>
        )}
      </header>

      {loadMessage ? <DashboardContentSkeleton /> : (
      <>
      <div className="stats-grid row g-3 mb-3 mx-0">
        {stats.map((stat) => (
          <div key={stat.label} className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card slide-up h-100">
              <div className="stat-card__heading">
                <p className="stat-card__label">{stat.label}</p>
                <span className={`stat-card__signal stat-card__signal--${stat.tone}`}>{stat.signal}</span>
              </div>
              <strong className="stat-card__value">{stat.value}</strong>
              <p className="stat-card__subtext">{stat.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-widgets row g-3 mx-0">
        <div className="col-12 col-xl-6">
          <div className="widget-card slide-up h-100">
            <h3 className="widget-title">Recent Activity</h3>
            <ul className="activity-feed list-unstyled mb-0">
              {summary.recentActivity.length === 0 ? (
                <li className="activity-item">
                  <p className="activity-text">No recent operational activity.</p>
                </li>
              ) : summary.recentActivity.map((item) => (
                <li key={`${item.type}-${item.id}`} className="activity-item">
                  <span className="activity-dot" />
                  <p className="activity-text">
                    <time className="activity-time">{formatActivityTime(item.timestamp)}</time>
                    {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="widget-card slide-up h-100">
            <h3 className="widget-title">Deployment Coverage</h3>
            <div className="coverage-bars">
              {summary.coverage.length === 0 ? (
                <p className="settings-hint mb-0">No active barangay deployment coverage.</p>
              ) : summary.coverage.map((row) => (
                <div key={row.code} className="coverage-row">
                  <span className="coverage-label">{row.label}</span>
                  <div className="coverage-bar-track">
                    <div className="coverage-bar-fill" style={{ '--pct': `${row.percentage}%` }} />
                  </div>
                  <span className="coverage-pct">{row.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}

export default DashboardPage
