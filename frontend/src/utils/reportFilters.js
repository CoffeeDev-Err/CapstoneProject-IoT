const DAY = 86400000
const PH_OFFSET = 8 * 3600000
export const REPORT_PERIODS = [
  ['all', 'All Dates'], ['today', 'Today'], ['week', 'This Week'],
  ['monthly', 'This Month'], ['weekly', 'Last 7 Days'], ['yearly', 'This Year'],
]

export const reportPeriodRange = (period, now = new Date()) => {
  if (period === 'all') return {}
  const local = new Date(+now + PH_OFFSET)
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - PH_OFFSET
  let start = today
  if (period === 'week') start -= ((local.getUTCDay() + 6) % 7) * DAY
  if (period === 'weekly') start -= 6 * DAY
  if (period === 'monthly') start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - PH_OFFSET
  if (period === 'yearly') start = Date.UTC(local.getUTCFullYear(), 0, 1) - PH_OFFSET
  return { from: new Date(start).toISOString(), to: new Date(today + DAY - 1).toISOString() }
}

export const readReportFilters = (params) => {
  const pick = (key, allowed, fallback = 'all') => allowed.includes(params.get(key)) ? params.get(key) : fallback
  const period = pick('period', REPORT_PERIODS.map(([value]) => value))
  const date = (key) => params.get(key) && Number.isFinite(Date.parse(params.get(key))) ? params.get(key) : ''
  return {
    period, search: params.get('search') || '', reportType: pick('report_type', ['incident', 'patrol', 'checkpoint', 'others']),
    category: pick('category', ['incident', 'routine']), validationStatus: pick('validation_status', ['pending', 'validated', 'rejected']),
    caseStatus: pick('case_status', ['open', 'resolved']), barangay: params.get('barangay') || 'all',
    cabaganOnly: params.get('scope') === 'cabagan',
    ...(date('from') && date('to') ? { from: date('from'), to: date('to') } : reportPeriodRange(period)),
  }
}

export const analyticsReportsUrl = (analytics, filters = {}) => {
  const params = new URLSearchParams({ period: analytics.period, from: analytics.start.toISOString(),
    to: analytics.end.toISOString(), scope: 'cabagan', ...filters })
  return `/reports?${params}`
}
