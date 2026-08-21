import { useCallback, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Eye, Search } from 'lucide-react'
import ReportDetailDrawer from '../components/ReportDetailDrawer'
import { useFeedback } from '../context/useFeedback'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { updateReportValidation } from '../services/operations'
import { matchesPrefixSearch } from '../utils/searchMatching'

const REPORTS_PER_PAGE = 10

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

const toCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

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
  const { reports: realtimeReports, refreshReports } = usePersonnelContext()
  const { showFeedback } = useFeedback()
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [reportTypeFilter, setReportTypeFilter] = useState('all')
  const [caseStatusFilter, setCaseStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [reviewState, setReviewState] = useState({
    isSaving: false,
    error: '',
    message: '',
  })
  const reports = useMemo(
    () => [...realtimeReports].sort(
      (firstReport, secondReport) => new Date(secondReport.date_time) - new Date(firstReport.date_time)
    ),
    [realtimeReports],
  )
  const reportTypes = useMemo(
    () => [...new Set(reports.map((report) => report.report_type))].sort(),
    [reports],
  )
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch = matchesPrefixSearch(searchTerm, [
        report.id,
        report.personnel_id,
        report.officer,
        report.assigned_area,
        report.barangay,
        report.title,
        report.location,
      ])
      const matchesType = reportTypeFilter === 'all' || report.report_type === reportTypeFilter
      const matchesStatus = caseStatusFilter === 'all'
        || (caseStatusFilter === 'open' && report.is_incident && report.case_status !== 'resolved')
        || (caseStatusFilter === 'resolved' && report.is_incident && report.case_status === 'resolved')

      return matchesSearch && matchesType && matchesStatus
    })
  }, [caseStatusFilter, reportTypeFilter, reports, searchTerm])
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / REPORTS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const pageStartIndex = (activePage - 1) * REPORTS_PER_PAGE
  const paginatedReports = filteredReports.slice(pageStartIndex, pageStartIndex + REPORTS_PER_PAGE)
  const firstVisibleReport = filteredReports.length === 0 ? 0 : pageStartIndex + 1
  const lastVisibleReport = Math.min(pageStartIndex + REPORTS_PER_PAGE, filteredReports.length)
  const visiblePageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => {
      const firstPage = Math.min(
        Math.max(1, activePage - 2),
        Math.max(1, totalPages - 4),
      )
      return firstPage + index
    },
  )
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
    setCurrentPage(1)
  }

  const updateReportTypeFilter = (value) => {
    setReportTypeFilter(value)
    setCurrentPage(1)
  }

  const updateCaseStatusFilter = (value) => {
    setCaseStatusFilter(value)
    setCurrentPage(1)
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
            <p>{filteredReports.length} of {reports.length} reports shown</p>
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
              {reportTypes.map((reportType) => (
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

        <div className="report-list" role="table" aria-label="Submitted police reports">
          <div className="report-list__header" role="row">
            <span role="columnheader">Officer</span>
            <span role="columnheader">Submitted</span>
            <span role="columnheader">Assigned area</span>
            <span role="columnheader" className="report-list__actions-heading">Actions</span>
          </div>

          {paginatedReports.map((report) => (
            <article className="report-list__row" role="row" key={report.id}>
              <div className="report-list__officer" role="cell">
                <span className="report-list__avatar" aria-hidden="true">{getInitials(report.officer)}</span>
                <div>
                  <strong>{report.officer}</strong>
                  <small>{report.personnel_id}</small>
                </div>
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

          {paginatedReports.length === 0 && (
            <div className="report-list-empty" role="row">
              <strong>No matching reports</strong>
              <span>Try a different search term or filter.</span>
            </div>
          )}
        </div>

        <nav className="report-pagination" aria-label="Report list pagination">
          <span className="report-pagination__summary">
            Showing {firstVisibleReport}-{lastVisibleReport} of {filteredReports.length}
          </span>

          <div className="report-pagination__controls">
            <button
              type="button"
              className="report-page-btn"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={activePage === 1}
              aria-label="Previous page"
              title="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
            </button>

            {visiblePageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={`report-page-btn ${activePage === pageNumber ? 'is-active' : ''}`}
                onClick={() => setCurrentPage(pageNumber)}
                aria-label={`Page ${pageNumber}`}
                aria-current={activePage === pageNumber ? 'page' : undefined}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              className="report-page-btn"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={activePage === totalPages}
              aria-label="Next page"
              title="Next page"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </nav>
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
