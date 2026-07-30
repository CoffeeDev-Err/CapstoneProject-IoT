import { isCabaganBarangay } from '../constants/cabaganBarangays.js'

const SEVERITY_LEVELS = {
  1: 'Informational',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Critical',
}

export const BARANGAY_ANALYTICS_PERIODS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

export const DEPLOYMENT_PRIORITY_WEIGHTS = {
  incidentVolume: 0.3,
  severity: 0.3,
  repeatLocations: 0.2,
  timePattern: 0.1,
  coverageGap: 0.1,
}

const clampScore = (value) => Math.max(0, Math.min(100, value))
const roundScore = (value) => Math.round(value * 10) / 10

const getReportDate = (report) => {
  const date = new Date(report.occurred_at || report.date_time)
  return Number.isNaN(date.getTime()) ? null : date
}

export const getAnalyticsReferenceDate = (reports) => {
  const timestamps = reports
    .map(getReportDate)
    .filter(Boolean)
    .map((date) => date.getTime())

  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date()
}

const startOfDay = (date) => {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

const endOfDay = (date) => {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

export const getAnalyticsPeriodRange = (period, referenceDate) => {
  const end = endOfDay(referenceDate)
  const start = startOfDay(referenceDate)

  if (period === 'weekly') {
    const dayOfWeek = start.getDay()
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    start.setDate(start.getDate() - daysSinceMonday)
  } else if (period === 'monthly') {
    start.setDate(1)
  } else {
    start.setMonth(0, 1)
  }

  return { start, end }
}

const formatPeriodLabel = (period, start, end) => {
  if (period === 'weekly') {
    return `Week of ${new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(start)}`
  }

  if (period === 'monthly') {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'long',
      year: 'numeric',
    }).format(end)
  }

  return String(end.getFullYear())
}

const getPriorityLevel = (score) => {
  if (score >= 75) return 'Critical'
  if (score >= 55) return 'High'
  if (score >= 30) return 'Moderate'
  return 'Low'
}

const getRecommendation = (level, peakTimeWindow) => {
  if (level === 'Critical') {
    return `Prioritize additional personnel and targeted patrols${peakTimeWindow ? ` during ${peakTimeWindow}` : ''}. Supervisor review is recommended.`
  }

  if (level === 'High') {
    return `Add a targeted patrol window${peakTimeWindow ? ` during ${peakTimeWindow}` : ''} and monitor repeat locations.`
  }

  if (level === 'Moderate') {
    return 'Maintain current coverage and review the barangay again after the next reporting period.'
  }

  return 'Maintain routine coverage. No immediate deployment increase is indicated by current records.'
}

const TIME_BUCKETS = [
  '12 AM-4 AM',
  '4 AM-8 AM',
  '8 AM-12 PM',
  '12 PM-4 PM',
  '4 PM-8 PM',
  '8 PM-12 AM',
]

const getTimePattern = (incidents) => {
  if (incidents.length === 0) {
    return {
      peakCount: 0,
      peakTimeWindow: '',
      score: 0,
    }
  }

  const counts = new Array(TIME_BUCKETS.length).fill(0)
  incidents.forEach((incident) => {
    const incidentDate = getReportDate(incident)
    if (incidentDate) {
      counts[Math.floor(incidentDate.getHours() / 4)] += 1
    }
  })

  const peakCount = Math.max(...counts)
  const peakIndex = counts.indexOf(peakCount)

  return {
    peakCount,
    peakTimeWindow: TIME_BUCKETS[peakIndex],
    score: incidents.length === 1 ? 25 : (peakCount / incidents.length) * 100,
  }
}

const getRepeatLocationPattern = (incidents) => {
  const locationCounts = new Map()

  incidents.forEach((incident) => {
    const locationKey = incident.location_key || incident.location
    if (locationKey) {
      locationCounts.set(locationKey, (locationCounts.get(locationKey) || 0) + 1)
    }
  })

  const rankedLocations = [...locationCounts.entries()].sort((first, second) => second[1] - first[1])
  const [topLocationKey, topLocationCount = 0] = rankedLocations[0] || []
  const topLocationReport = incidents.find(
    (incident) => (incident.location_key || incident.location) === topLocationKey
  )

  return {
    topLocation: topLocationReport?.location || '',
    topLocationCount,
    score: topLocationCount >= 2 ? (topLocationCount / incidents.length) * 100 : 0,
  }
}

export const filterReportsForAnalyticsPeriod = (reports, period, referenceDate) => {
  const { start, end } = getAnalyticsPeriodRange(period, referenceDate)

  return reports.filter((report) => {
    const reportDate = getReportDate(report)
    return reportDate && reportDate >= start && reportDate <= end
  })
}

export const buildBarangayAnalytics = ({
  reports,
  deploymentCoverage,
  period = 'weekly',
  referenceDate = getAnalyticsReferenceDate(reports),
}) => {
  const { start, end } = getAnalyticsPeriodRange(period, referenceDate)
  const periodLabel = formatPeriodLabel(period, start, end)
  const allPeriodReports = filterReportsForAnalyticsPeriod(reports, period, referenceDate)
  const periodReports = allPeriodReports.filter(
    (report) => isCabaganBarangay(report.barangay),
  )
  const incidentReports = periodReports.filter((report) => report.is_incident)
  const resolvedCases = incidentReports.filter((report) => report.case_status === 'resolved')
  const barangayNames = new Set(
    periodReports.map((report) => report.barangay).filter(Boolean),
  )

  const validatedIncidentCounts = [...barangayNames].map((barangay) => periodReports.filter(
    (report) => report.barangay === barangay
      && report.is_incident
      && report.validation_status === 'validated'
  ).length)
  const maxIncidentCount = Math.max(0, ...validatedIncidentCounts)

  const barangays = [...barangayNames].map((barangay) => {
    const barangayReports = periodReports.filter((report) => report.barangay === barangay)
    const incidents = barangayReports.filter(
      (report) => report.is_incident && report.validation_status === 'validated'
    )
    const coverage = deploymentCoverage.find((item) => item.barangay === barangay) || {
      assignedPersonnel: 0,
      availablePersonnel: 0,
      requiredPersonnel: 0,
    }

    const averageSeverity = incidents.length > 0
      ? incidents.reduce((total, incident) => total + Number(incident.severity || 1), 0) / incidents.length
      : 0
    const incidentVolumeScore = maxIncidentCount > 0
      ? (incidents.length / maxIncidentCount) * 100
      : 0
    const severityScore = (averageSeverity / 5) * 100
    const repeatLocationPattern = getRepeatLocationPattern(incidents)
    const timePattern = getTimePattern(incidents)
    const coverageGapScore = coverage.requiredPersonnel > 0
      ? (Math.max(0, coverage.requiredPersonnel - coverage.availablePersonnel) / coverage.requiredPersonnel) * 100
      : 0

    const scoreBreakdown = {
      incidentVolume: roundScore(clampScore(incidentVolumeScore)),
      severity: roundScore(clampScore(severityScore)),
      repeatLocations: roundScore(clampScore(repeatLocationPattern.score)),
      timePattern: roundScore(clampScore(timePattern.score)),
      coverageGap: roundScore(clampScore(coverageGapScore)),
    }
    const priorityScore = roundScore(
      scoreBreakdown.incidentVolume * DEPLOYMENT_PRIORITY_WEIGHTS.incidentVolume
      + scoreBreakdown.severity * DEPLOYMENT_PRIORITY_WEIGHTS.severity
      + scoreBreakdown.repeatLocations * DEPLOYMENT_PRIORITY_WEIGHTS.repeatLocations
      + scoreBreakdown.timePattern * DEPLOYMENT_PRIORITY_WEIGHTS.timePattern
      + scoreBreakdown.coverageGap * DEPLOYMENT_PRIORITY_WEIGHTS.coverageGap
    )
    const priorityLevel = getPriorityLevel(priorityScore)
    const reasons = [
      `${incidents.length} validated incident${incidents.length === 1 ? '' : 's'} in ${periodLabel}`,
    ]

    if (incidents.length > 0) {
      reasons.push(`Average severity: ${SEVERITY_LEVELS[Math.round(averageSeverity)] || 'Informational'} (${roundScore(averageSeverity)}/5)`)
    }
    if (repeatLocationPattern.topLocationCount >= 2) {
      reasons.push(`${repeatLocationPattern.topLocationCount} incidents around ${repeatLocationPattern.topLocation}`)
    }
    if (timePattern.peakCount >= 2) {
      reasons.push(`${timePattern.peakCount} incidents concentrated during ${timePattern.peakTimeWindow}`)
    }
    if (coverage.requiredPersonnel > 0) {
      reasons.push(`${coverage.availablePersonnel} of ${coverage.requiredPersonnel} required personnel currently available`)
    }

    return {
      barangay,
      reportCount: barangayReports.length,
      validatedIncidentCount: incidents.length,
      averageSeverity: roundScore(averageSeverity),
      assignedPersonnel: coverage.assignedPersonnel,
      availablePersonnel: coverage.availablePersonnel,
      requiredPersonnel: coverage.requiredPersonnel,
      topLocation: repeatLocationPattern.topLocation,
      topLocationCount: repeatLocationPattern.topLocationCount,
      peakTimeWindow: timePattern.peakTimeWindow,
      peakTimeCount: timePattern.peakCount,
      scoreBreakdown,
      priorityScore,
      priorityLevel,
      reasons,
      recommendation: getRecommendation(priorityLevel, timePattern.peakTimeWindow),
    }
  }).sort((first, second) => (
    second.priorityScore - first.priorityScore
    || second.validatedIncidentCount - first.validatedIncidentCount
    || second.reportCount - first.reportCount
    || first.barangay.localeCompare(second.barangay)
  ))

  return {
    period,
    periodLabel,
    start,
    end,
    totalReports: periodReports.length,
    totalIncidentReports: incidentReports.length,
    totalValidatedIncidents: periodReports.filter(
      (report) => report.is_incident && report.validation_status === 'validated'
    ).length,
    totalResolvedCases: resolvedCases.length,
    highPriorityBarangays: barangays.filter(
      (barangay) => barangay.priorityLevel === 'High' || barangay.priorityLevel === 'Critical'
    ).length,
    excludedOutsideCabaganReports: allPeriodReports.length - periodReports.length,
    barangays,
  }
}
