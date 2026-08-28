import { useCallback, useEffect, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
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
  const [reportResults, setReportResults] = useState({
    data: [], pagination: EMPTY_PAGINATION, requestKey: '', error: '',
  })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [reviewState, setReviewState] = useState({ isSaving: false, error: '', message: '' })
  const requestKey = [debouncedSearchTerm, reportTypeFilter, caseStatusFilter,
    sortBy, sortOrder, refreshVersion, reportsRevision].join('|')

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
      if (isCurrent) setReportResults({ ...result, requestKey, error: '' })
    }).catch((error) => {
      if (!isCurrent || error?.name === 'AbortError') return
      setReportResults({
        data: [], pagination: EMPTY_PAGINATION, requestKey,
        error: error.message || 'Reports could not be loaded.',
      })
    })
    return () => {
      isCurrent = false
      requestController.abort()
    }
  }, [caseStatusFilter, debouncedSearchTerm, refreshVersion, reportTypeFilter,
    reportsRevision, requestKey, sortBy, sortOrder])

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
    isReportsLoading: reportResults.requestKey !== requestKey,
    pagination: reportResults.pagination,
    reportTypeFilter,
    reports,
    reportsError: reportResults.error,
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
