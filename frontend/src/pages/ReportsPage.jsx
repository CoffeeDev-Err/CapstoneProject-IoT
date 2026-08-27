import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, Search } from 'lucide-react'
import ReportDetailDrawer from '../components/ReportDetailDrawer'
import { ReportListSkeleton } from '../components/LoadingSkeleton'
import { useFeedback } from '../context/useFeedback'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { getReportsList, updateReportValidation } from '../services/operations'

const REPORTS_PER_REQUEST = 100
const REPORT_TYPES = ['incident', 'patrol', 'checkpoint', 'others']
const EMPTY_PAGINATION = {
  page: 1,
  limit: REPORTS_PER_REQUEST,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

const formatDateTime = (isoValue) => {
  if (!isoValue) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoValue))
}

const toCsvValue = (value) => {
  const rawValue = String(value ?? '')
  const safeValue = typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(rawValue)
    ? `'${rawValue}`
    : rawValue
  return `"${safeValue.replace(/"/g, '""')}"`
}

const getInitials = (name) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase()

const downloadCsv = (rows, fileName) => {
  const csvContent = rows
    .map((row) => (row.length === 0 ? '' : row.map(toCsvValue).join(',')))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const downloadAnchor = document.createElement('a')

  downloadAnchor.href = url
  downloadAnchor.download = fileName
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  document.body.removeChild(downloadAnchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const getReportCsvRows = (report) => [
  ['Report ID', report.id],
  ['Personnel ID', report.personnel_id],
  ['Officer', report.officer],
  ['Submitted At', report.date_time],
  ['Occurred At', report.occurred_at],
  ['Assigned Area', report.assigned_area],
  ['Barangay', report.barangay],
  ['Report Type', report.report_type],
  ['Severity', report.severity],
  ['Validation Status', report.validation_status],
  ['Case Status', report.case_status || 'not_applicable'],
  ['Resolved At', report.resolved_at || ''],
  ['Resolution Notes', report.resolution_notes || ''],
  ['Title', report.title],
  ['Description', report.description],
  ['Location', report.location],
]

function ReportsPage() {
  const { refreshReports, reportsRevision } = usePersonnelContext()
  const { showFeedback } = useFeedback()
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 250)
  const [reportTypeFilter, setReportTypeFilter] = useState('all')
  const [caseStatusFilter, setCaseStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('submitted_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [reportResults, setReportResults] = useState({
    data: [],
    pagination: EMPTY_PAGINATION,
    requestKey: '',
    error: '',
  })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [reviewState, setReviewState] = useState({
    isSaving: false,
    error: '',
    message: '',
  })
  const requestKey = [
    debouncedSearchTerm,
    reportTypeFilter,
    caseStatusFilter,
    sortBy,
    sortOrder,
    refreshVersion,
    reportsRevision,
  ].join('|')
  const isReportsLoading = reportResults.requestKey !== requestKey

  useEffect(() => {
    const requestController = new AbortController()
    let isCurrent = true

    getReportsList({
      limit: REPORTS_PER_REQUEST,
      search: debouncedSearchTerm,
      reportType: reportTypeFilter,
      caseStatus: caseStatusFilter,
      sortBy,
      sortOrder,
      signal: requestController.signal,
    })
      .then((result) => {
        if (!isCurrent) return
        setReportResults({ ...result, requestKey, error: '' })
      })
      .catch((error) => {
        if (!isCurrent || error?.name === 'AbortError') return
        setReportResults({
          data: [],
          pagination: EMPTY_PAGINATION,
          requestKey,
          error: error.message || 'Reports could not be loaded.',
        })
      })

    return () => {
      isCurrent = false
      requestController.abort()
    }
  }, [
    caseStatusFilter,
    debouncedSearchTerm,
    refreshVersion,
    reportTypeFilter,
    reportsRevision,
    requestKey,
    sortBy,
    sortOrder,
  ])

  const reports = reportResults.data
  const pagination = reportResults.pagination
  const reportsError = reportResults.error
  const selectedReport = reports.find((report) => report.id === selectedReportId) || null

  const handleCloseReport = useCallback(() => {
    setSelectedReportId(null)
    setReviewState({ isSaving: false, error: '', message: '' })
  }, [])

  const handleOpenReport = useCallback((reportId) => {
    setReviewState({ isSaving: false, error: '', message: '' })
    setSelectedReportId(reportId)
  }, [])

  const handleValidationChange = useCallback(async (validationStatus) => {
    if (!selectedReport || reviewState.isSaving) return

    setReviewState({ isSaving: true, error: '', message: '' })
    try {
      await updateReportValidation(selectedReport.id, validationStatus)
      await refreshReports()
      setRefreshVersion((version) => version + 1)
      setReviewState({
        isSaving: false,
        error: '',
        message: '',
      })
      showFeedback(`Report marked ${validationStatus}. Analytics has been updated.`, { type: 'success' })
    } catch (error) {
      setReviewState({ isSaving: false, error: '', message: '' })
      showFeedback(error.message, { type: 'error', title: 'Report update failed' })
    }
  }, [refreshReports, reviewState.isSaving, selectedReport, showFeedback])

  const handleDownloadReport = useCallback((report) => {
    downloadCsv(getReportCsvRows(report), `${report.id.toLowerCase()}.csv`)
    showFeedback(`${report.id} downloaded successfully.`, { type: 'success' })
  }, [showFeedback])

  const updateSearchTerm = (value) => {
    setSearchTerm(value)
  }

  const updateReportTypeFilter = (value) => {
    setReportTypeFilter(value)
  }

  const updateCaseStatusFilter = (value) => {
    setCaseStatusFilter(value)
  }

  const updateSort = (field) => {
    setSortOrder((currentOrder) => (sortBy === field && currentOrder === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }

  const renderSortHeading = (label, field) => {
    const isActive = sortBy === field
    const SortIcon = isActive ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <button
        type="button"
        className={`report-sort-heading${isActive ? ' is-active' : ''}`}
        onClick={() => updateSort(field)}
        aria-label={`Sort by ${label} ${isActive && sortOrder === 'asc' ? 'descending' : 'ascending'}`}
        title={isActive
          ? `${label}: ${sortOrder === 'asc' ? 'ascending' : 'descending'} — click to reverse`
          : `Sort reports by ${label}`}
      >
        {label}
        <SortIcon aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header mb-3 reports-header">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-subtitle">Police incident and patrol report records</p>
        </div>
      </header>

      <div className="widget-card slide-up report-list-panel">
        <div className="report-list-panel__header">
          <div>
            <h3 className="widget-title mb-0">Submitted reports</h3>
            <p>{reports.length} of {pagination.total} matching reports shown</p>
          </div>
        </div>

        <div className="report-list-controls">
          <label className="report-search">
            <span className="visually-hidden">Search reports</span>
            <Search className="report-search__icon" aria-hidden="true" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => updateSearchTerm(event.target.value)}
              placeholder="Search officer, area, barangay, or report ID"
            />
          </label>

          <label className="report-filter">
            <span>Report type</span>
            <select
              value={reportTypeFilter}
              onChange={(event) => updateReportTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              {REPORT_TYPES.map((reportType) => (
                <option key={reportType} value={reportType}>
                  {reportType}
                </option>
              ))}
            </select>
          </label>

          <label className="report-filter">
            <span>Case status</span>
            <select
              value={caseStatusFilter}
              onChange={(event) => updateCaseStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="open">Open incidents</option>
              <option value="resolved">Resolved incidents</option>
            </select>
          </label>
        </div>

        <div className="report-list record-scroll-container" role="table" aria-label="Submitted police reports">
          <div className="report-list__header" role="row">
            <span role="columnheader">Officer</span>
            <span role="columnheader">{renderSortHeading('Type', 'report_type')}</span>
            <span role="columnheader">{renderSortHeading('Severity', 'severity')}</span>
            <span role="columnheader">{renderSortHeading('Status', 'validation_status')}</span>
            <span role="columnheader">{renderSortHeading('Submitted', 'submitted_at')}</span>
            <span role="columnheader">Assigned area</span>
            <span role="columnheader" className="report-list__actions-heading">Actions</span>
          </div>

          {isReportsLoading ? (
            <ReportListSkeleton />
          ) : reports.map((report) => (
            <article className="report-list__row" role="row" key={report.id}>
              <div className="report-list__officer" role="cell">
                <span className="report-list__avatar" aria-hidden="true">{getInitials(report.officer)}</span>
                <div>
                  <strong>{report.officer}</strong>
                  <small>{report.personnel_id}</small>
                </div>
              </div>
              <div className="report-list__type" role="cell">
                <span className="report-list__mobile-label">Type</span>
                <span className="report-type-pill">{report.report_type || 'other'}</span>
              </div>
              <div className="report-list__severity" role="cell">
                <span className="report-list__mobile-label">Severity</span>
                <span className={`report-severity report-severity--${Number(report.severity) || 1}`}>
                  {report.severity || 1}/5
                </span>
              </div>
              <div className="report-list__status" role="cell">
                <span className="report-list__mobile-label">Status</span>
                <span className={`report-decision-status report-decision-status--${report.validation_status || 'pending'}`}>
                  {report.validation_status || 'pending'}
                </span>
                {report.report_type === 'incident' && (
                  <small>{report.case_status || 'open'} case</small>
                )}
              </div>
              <div className="report-list__submitted" role="cell">
                <span className="report-list__mobile-label">Submitted</span>
                <time dateTime={report.date_time}>{formatDateTime(report.date_time)}</time>
              </div>
              <div className="report-list__area" role="cell">
                <span className="report-list__mobile-label">Assigned area</span>
                <span>{report.assigned_area}</span>
              </div>
              <div className="report-list__actions" role="cell">
                <button
                  type="button"
                  className="report-action-btn report-action-btn--secondary"
                  onClick={() => handleDownloadReport(report)}
                >
                  <Download aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  className="report-action-btn report-action-btn--primary"
                  onClick={() => handleOpenReport(report.id)}
                >
                  <Eye aria-hidden="true" />
                  View report
                </button>
              </div>
            </article>
          ))}

          {!isReportsLoading && reports.length === 0 && (
            <div className="report-list-empty" role="row">
              <strong>{reportsError ? 'Reports unavailable' : 'No matching reports'}</strong>
              <span>{reportsError || 'Try a different search term or filter.'}</span>
            </div>
          )}
        </div>

      </div>

      <ReportDetailDrawer
        report={selectedReport}
        formatDateTime={formatDateTime}
        onClose={handleCloseReport}
        onDownload={handleDownloadReport}
        onValidationChange={handleValidationChange}
        validationState={reviewState}
      />
    </div>
  )
}

export default ReportsPage
