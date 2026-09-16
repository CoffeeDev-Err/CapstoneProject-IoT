import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BarangayOperationalAnalytics from '../components/BarangayOperationalAnalytics'
import { AnalyticsContentSkeleton } from '../components/LoadingSkeleton'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { useFeedback } from '../context/useFeedback'
import { getReportsList } from '../services/operations'
import { analyticsReportsUrl, reportPeriodRange } from '../utils/reportFilters'
import { BARANGAY_ANALYTICS_PERIODS, BASELINE_REQUIRED_PERSONNEL, buildBarangayAnalytics } from '../utils/barangayAnalytics'

const barangayFromArea = (area = '') => String(area).split(',')[0].trim()
  .replace(/^barangay\s+/i, '').split(/public|market|zone|route|road|checkpoint|perimeter/i)[0].trim()

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('weekly')
  const [referenceDate] = useState(() => new Date())
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState({ key: '', reports: [], error: '' })
  const [menu, setMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [priorityRequest, setPriorityRequest] = useState(0)
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)
  const navigate = useNavigate()
  const { showFeedback } = useFeedback()
  const { deployments, personnel, reportsRevision, isInitialDataLoading, initialDataError, retryInitialData } = usePersonnelContext()
  const { from, to } = reportPeriodRange(period, referenceDate)
  const requestKey = JSON.stringify([period, from, to, retry, reportsRevision])
  useEffect(() => {
    const controller = new AbortController()
    getReportsList({ from, to, cabaganOnly: true, signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, reports: data, error: '' })
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, reports: [], error: error.message })
    })
    return () => controller.abort()
  }, [from, to, requestKey])
  useEffect(() => {
    if (!menu) return undefined
    menuRef.current?.querySelector('button')?.focus()
    const click = (event) => { if (!menuRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target)) setMenu(false) }
    const key = (event) => { if (event.key === 'Escape') { setMenu(false); menuButtonRef.current?.focus() } }
    document.addEventListener('pointerdown', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key) }
  }, [menu])
  const coverage = useMemo(() => {
    const members = new Map(personnel.map((member) => [member.id, member]))
    const grouped = new Map()
    deployments.filter((deployment) => (!deployment.status || deployment.status === 'active') && deployment.isCurrentShift !== false).forEach((deployment) => {
      const barangay = deployment.barangay || barangayFromArea(deployment.patrolArea)
      const entry = grouped.get(barangay) || { barangay, assigned: new Set(), available: new Set() }
      entry.assigned.add(deployment.personnelId)
      const member = members.get(deployment.personnelId)
      if (member && member.status !== 'Off Duty') entry.available.add(deployment.personnelId)
      grouped.set(barangay, entry)
    })
    return [...grouped.values()].map((entry) => ({ barangay: entry.barangay, assignedPersonnel: entry.assigned.size,
      availablePersonnel: entry.available.size, requiredPersonnel: BASELINE_REQUIRED_PERSONNEL }))
  }, [deployments, personnel])
  const analytics = useMemo(() => buildBarangayAnalytics({ reports: result.reports, deploymentCoverage: coverage, period, referenceDate }), [result.reports, coverage, period, referenceDate])
  const loading = result.key !== requestKey || isInitialDataLoading
  const error = result.error || initialDataError
  const viewReports = (filters = {}) => navigate(analyticsReportsUrl(analytics, filters))
  const showPriority = () => {
    setPriorityRequest((value) => value + 1)
    const element = document.getElementById('barangay-priority-section')
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }
  const stats = [
    { label: 'Submitted Reports', value: analytics.totalReports, subtext: analytics.periodLabel, action: 'View submitted reports', click: () => viewReports() },
    { label: 'Validated Incidents', value: analytics.totalValidatedIncidents, subtext: 'Confirmed incident reports', action: 'View validated incidents', click: () => viewReports({ category: 'incident', validation_status: 'validated' }) },
    { label: 'Resolved Cases', value: analytics.totalResolvedCases, subtext: `Of ${analytics.totalIncidentReports} submitted incidents`, action: 'View resolved cases', click: () => viewReports({ category: 'incident', case_status: 'resolved' }) },
    { label: 'High-Priority Barangays', value: analytics.highPriorityBarangays, subtext: `Highest: ${analytics.barangays[0]?.barangay || 'None'}`, action: 'View deployment priority', click: showPriority },
  ]
  const generate = async (kind) => {
    setMenu(false); menuButtonRef.current?.focus(); setExporting(true)
    try {
      const { downloadAnalytics } = await import('../utils/reportExports')
      await downloadAnalytics(kind, analytics, result.reports)
      showFeedback(`Analytics ${kind === 'pdf' ? 'PDF' : 'Excel file'} downloaded.`, { type: 'success' })
    } catch (failure) { showFeedback(failure.message || 'Could not generate analytics. Retry.', { type: 'error' }) }
    finally { setExporting(false) }
  }
  return <div className="page-container fade-in p-3 p-md-4">
    <header className="page-header mb-4 reports-header">
      <div><h2 className="page-title">Analytics</h2><p className="page-subtitle">Patrol, incident, and barangay deployment trends</p></div>
      <div className="analytics-page-actions">
        <div className="analytics-segmented-control" aria-label="Analytics period">
          {BARANGAY_ANALYTICS_PERIODS.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value}
            className={period === option.value ? 'is-active' : ''} onClick={() => setPeriod(option.value)}>{option.label}</button>)}
        </div>
        <div className="analytics-download">
          <button ref={menuButtonRef} type="button" className="report-generate-btn" aria-expanded={menu} aria-controls="analytics-download-options"
            disabled={loading || Boolean(error) || exporting} onClick={() => setMenu(!menu)}>{exporting ? 'Generating...' : 'Generate Report ▾'}</button>
          {menu && <div ref={menuRef} className="analytics-download-menu" id="analytics-download-options" aria-label="Download format">
            <button onClick={() => generate('pdf')}>PDF Report</button><button onClick={() => generate('xlsx')}>Excel Data (.xlsx)</button>
          </div>}
        </div>
      </div>
    </header>
    {error && <p className="field-error" role="alert">{error} <button className="report-action-btn" onClick={() => { setRetry((value) => value + 1); retryInitialData?.() }}>Retry</button></p>}
    {loading ? <AnalyticsContentSkeleton /> : !error && <>
      <p className="settings-hint">Period counts use submission dates in Philippine time. Personnel coverage is current.</p>
      <div className="stats-grid analytics-stats-grid row g-3 mb-3 mx-0">
        {stats.map((stat) => <div className="col-12 col-sm-6 col-xl-3" key={stat.label}>
          <button type="button" className="stat-card stat-card--action slide-up h-100" onClick={stat.click}>
            <div className="stat-card__heading"><p className="stat-card__label">{stat.label}</p></div>
            <strong className="stat-card__value">{stat.value}</strong><p className="stat-card__subtext">{stat.subtext}</p>
            <span className="stat-card__action">{stat.action} →</span>
          </button>
        </div>)}
      </div>
      <BarangayOperationalAnalytics analytics={analytics} period={period} priorityRequest={priorityRequest} onViewReports={(barangay) => viewReports({ barangay })} />
    </>}
  </div>
}
