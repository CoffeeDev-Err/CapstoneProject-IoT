import { useCallback, useEffect, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useCachedPageData } from '../../hooks/useCachedPageData'
import { getReportsList, updateReportValidation } from '../../services/operations'
import {
  downloadReportCsv,
  EMPTY_PAGINATION,
  REPORTS_PER_REQUEST,
} from './reportPresentation'

export function useReportsPageState({ refreshReports, reportsRevision, showFeedback }) {
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 250)
  const [reportTypeFilter, setReportTypeFilter] = useState('all')
  const [caseStatusFilter, setCaseStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('submitted_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [reviewState, setReviewState] = useState({ isSaving: false, error: '', message: '' })
  // Revisions trigger a refresh, not a new cache entry. Filter variants must
  // stay separate so a previous query's rows are never shown for a new query.
  const queryKey = JSON.stringify([debouncedSearchTerm, reportTypeFilter,
    caseStatusFilter, sortBy, sortOrder])
  const requestKey = JSON.stringify([queryKey, refreshVersion, reportsRevision])
  const [reportResults, setReportResults, hasReports] = useCachedPageData(`reports:${queryKey}`, {
    data: [], pagination: EMPTY_PAGINATION,
  })
  const [requestOutcome, setRequestOutcome] = useState({ requestKey: '', error: '' })

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
    }).then((result) => {
      if (!isCurrent) return
      setReportResults(result)
      setRequestOutcome({ requestKey, error: '' })
    }).catch((error) => {
      if (!isCurrent || error?.name === 'AbortError') return
      setRequestOutcome({
        requestKey,
        error: error.message || 'Reports could not be loaded.',
      })
    })
    return () => {
      isCurrent = false
      requestController.abort()
    }
  }, [caseStatusFilter, debouncedSearchTerm, refreshVersion, reportTypeFilter,
    reportsRevision, requestKey, setReportResults, sortBy, sortOrder])

  const reports = reportResults.data
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
      setReviewState({ isSaving: false, error: '', message: '' })
      showFeedback(`Report marked ${validationStatus}. Analytics has been updated.`, { type: 'success' })
    } catch (error) {
      setReviewState({ isSaving: false, error: '', message: '' })
      showFeedback(error.message, { type: 'error', title: 'Report update failed' })
    }
  }, [refreshReports, reviewState.isSaving, selectedReport, showFeedback])
  const handleDownloadReport = useCallback((report) => {
    downloadReportCsv(report)
    showFeedback(`${report.id} downloaded successfully.`, { type: 'success' })
  }, [showFeedback])
  const updateSort = (field) => {
    setSortOrder((current) => (sortBy === field && current === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }

  return {
    caseStatusFilter,
    handleCloseReport,
    handleDownloadReport,
    handleOpenReport,
    handleValidationChange,
    isReportsLoading: !hasReports && requestOutcome.requestKey !== requestKey,
    pagination: reportResults.pagination,
    reportTypeFilter,
    reports,
    reportsError: requestOutcome.requestKey === requestKey ? requestOutcome.error : '',
    retryReports: () => setRefreshVersion((version) => version + 1),
    reviewState,
    searchTerm,
    selectedReport,
    setCaseStatusFilter,
    setReportTypeFilter,
    setSearchTerm,
    sortBy,
    sortOrder,
    updateSearchTerm: setSearchTerm,
    updateReportTypeFilter: setReportTypeFilter,
    updateCaseStatusFilter: setCaseStatusFilter,
    updateSort,
  }
}
