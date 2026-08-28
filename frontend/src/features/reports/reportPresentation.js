export const REPORTS_PER_REQUEST = 100
export const REPORT_TYPES = ['incident', 'patrol', 'checkpoint', 'others']
export const EMPTY_PAGINATION = {
  page: 1,
  limit: REPORTS_PER_REQUEST,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

export const formatReportDateTime = (isoValue) => {
  if (!isoValue) return '-'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(isoValue))
}

export const getOfficerInitials = (name) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase()

const toCsvValue = (value) => {
  const rawValue = String(value ?? '')
  const safeValue = typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(rawValue)
    ? `'${rawValue}` : rawValue
  return `"${safeValue.replace(/"/g, '""')}"`
}

const getReportCsvRows = (report) => [
  ['Report ID', report.id], ['Personnel ID', report.personnel_id], ['Officer', report.officer],
  ['Submitted At', report.date_time], ['Occurred At', report.occurred_at],
  ['Assigned Area', report.assigned_area], ['Barangay', report.barangay],
  ['Report Type', report.report_type], ['Severity', report.severity],
  ['Validation Status', report.validation_status], ['Case Status', report.case_status || 'not_applicable'],
  ['Resolved At', report.resolved_at || ''], ['Resolution Notes', report.resolution_notes || ''],
  ['Title', report.title], ['Description', report.description], ['Location', report.location],
]

export const downloadReportCsv = (report) => {
  const csvContent = getReportCsvRows(report)
    .map((row) => row.map(toCsvValue).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${report.id.toLowerCase()}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
