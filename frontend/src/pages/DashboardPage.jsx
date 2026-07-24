/**
 * DashboardPage.jsx — Operations Overview
 *
 * The home screen supervisors see first. Displays a summary of current-day
 * field operations in three sections:
 *
 *   1. Stats Grid     — four KPI cards (patrols, response time, incidents, officers)
 *   2. Recent Activity — chronological feed of logged events from the field
 *   3. Patrol Coverage — horizontal bar chart showing per-barangay coverage %
 *
 * Note: All data here is static/sample. In production, connect these to
 * the REST API (e.g., GET /api/stats/today) and use useState + useEffect.
 */

const RESPONSE_MODEL = {
  baseDispatchMinutes: 1.2,
  averageSpeedKph: 24,
}

const NORMALIZATION_DISTANCE_METERS = 1200

/**
 * Each incident stores candidate responder distances.
 * Dashboard ranking uses a normalized-distance score so short routes do not
 * automatically dominate the displayed "fastest" response.
 */
const todaysIncidentDispatches = [
  { id: 'INC-001', location: 'Barangay Centro', officerDistancesMeters: [100, 200] },
  { id: 'INC-002', location: 'National Highway', officerDistancesMeters: [220, 350, 410] },
  { id: 'INC-003', location: 'West District', officerDistancesMeters: [160, 230] },
  { id: 'INC-004', location: 'East District', officerDistancesMeters: [480, 520] },
  { id: 'INC-005', location: 'Market Area', officerDistancesMeters: [140, 300, 620] },
  { id: 'INC-006', location: 'Cabagan Public Market', officerDistancesMeters: [260, 310] },
  { id: 'INC-007', location: 'San Juan Junction', officerDistancesMeters: [90, 210, 280] },
]

const yesterdayIncidentDispatches = [
  { id: 'INC-Y01', officerDistancesMeters: [180, 260] },
  { id: 'INC-Y02', officerDistancesMeters: [340, 410] },
  { id: 'INC-Y03', officerDistancesMeters: [250, 320, 380] },
  { id: 'INC-Y04', officerDistancesMeters: [520, 600] },
  { id: 'INC-Y05', officerDistancesMeters: [210, 290] },
  { id: 'INC-Y06', officerDistancesMeters: [370, 440] },
  { id: 'INC-Y07', officerDistancesMeters: [280, 350] },
]

const estimateResponseMinutes = (distanceMeters) => {
  const distanceKm = distanceMeters / 1000
  const travelMinutes = (distanceKm / RESPONSE_MODEL.averageSpeedKph) * 60
  return RESPONSE_MODEL.baseDispatchMinutes + travelMinutes
}

const getDistanceNormalizedResponseMinutes = (distanceMeters) => {
  if (distanceMeters <= 0) {
    return Number.POSITIVE_INFINITY
  }

  return estimateResponseMinutes(distanceMeters) * (NORMALIZATION_DISTANCE_METERS / distanceMeters)
}

const buildDispatchCandidates = (dispatches) =>
  dispatches.flatMap((dispatch) =>
    dispatch.officerDistancesMeters.map((distanceMeters) => ({
      distanceMeters,
      responseMinutes: estimateResponseMinutes(distanceMeters),
      normalizedResponseMinutes: getDistanceNormalizedResponseMinutes(distanceMeters),
    })),
  )

const getFastestNormalizedCandidate = (candidates) => {
  let oldBestCandidate = null

  for (const newCandidate of candidates) {
    if (
      !oldBestCandidate
      || newCandidate.normalizedResponseMinutes < oldBestCandidate.normalizedResponseMinutes
    ) {
      oldBestCandidate = newCandidate
    }
  }

  return oldBestCandidate
}

const formatMinutes = (minutes) => `${minutes.toFixed(1)} min`

const formatMeters = (meters) => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  return `${(meters / 1000).toFixed(1)} km`
}

const formatSignedChange = (value) => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}`
}

const todaysDispatchCandidates = buildDispatchCandidates(todaysIncidentDispatches)
const yesterdayDispatchCandidates = buildDispatchCandidates(yesterdayIncidentDispatches)

const fastestTodayCandidate = getFastestNormalizedCandidate(todaysDispatchCandidates)
const fastestYesterdayCandidate = getFastestNormalizedCandidate(yesterdayDispatchCandidates)

const todaysDisplayedResponseMinutes = fastestTodayCandidate?.responseMinutes ?? 0
const responseTimeDeltaMinutes =
  fastestTodayCandidate && fastestYesterdayCandidate
    ? fastestTodayCandidate.responseMinutes - fastestYesterdayCandidate.responseMinutes
    : 0

/**
 * KPI cards shown in the stats grid at the top of the page.
 * 'up: true' colours the change green (positive), 'up: false' colours it red.
 */
const stats = [
  { label: 'Total Patrols Today', value: '24', change: '+4', up: true },
  {
    label: 'Avg Response Time',
    value: formatMinutes(todaysDisplayedResponseMinutes),
    subtext: fastestTodayCandidate
      ? `Distance: ${formatMeters(fastestTodayCandidate.distanceMeters)}`
      : 'Distance: -',
    change: formatSignedChange(responseTimeDeltaMinutes),
    up: responseTimeDeltaMinutes <= 0,
  },
  { label: 'Incidents Logged', value: '7', change: '+2', up: false },
  { label: 'Officers On Duty', value: '18', change: '+1', up: true },
]

/** Timestamped log entries displayed in the Recent Activity widget. */
const activityFeed = [
  { id: 1, time: '08:42 AM', text: 'PO1 Santos started patrol in Barangay Centro.' },
  { id: 2, time: '09:15 AM', text: 'SPO1 Reyes responded to traffic incident on NM Highway.' },
  { id: 3, time: '10:03 AM', text: 'Backup requested near Cabagan Public Market.' },
  { id: 4, time: '11:27 AM', text: 'All units reported in. Status: normal.' },
  { id: 5, time: '12:50 PM', text: 'PO2 Mon Maguas completed shift B patrol route.' },
]

function DashboardPage() {
  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header mb-4">
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Overview of today&apos;s field operations</p>
      </header>

      <div className="stats-grid row g-3 mb-3 mx-0">
        {stats.map((stat) => (
          <div key={stat.label} className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card slide-up h-100">
              <p className="stat-card__label">{stat.label}</p>
              <strong className="stat-card__value">{stat.value}</strong>
              {stat.subtext ? <p className="stat-card__subtext">{stat.subtext}</p> : null}
              <span className={`stat-card__change ${stat.up ? 'up' : 'down'}`}>
                {stat.change} vs yesterday
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-widgets row g-3 mx-0">
        <div className="col-12 col-xl-6">
          <div className="widget-card slide-up h-100">
            <h3 className="widget-title">Recent Activity</h3>
            <ul className="activity-feed list-unstyled mb-0">
              {activityFeed.map((item) => (
                <li key={item.id} className="activity-item">
                  <span className="activity-dot" />
                  <p className="activity-text">
                    <time className="activity-time">{item.time}</time>
                    {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="widget-card slide-up h-100">
            <h3 className="widget-title">Patrol Coverage</h3>
            <div className="coverage-bars">
              {[
                { label: 'Barangay Centro', pct: 92 },
                { label: 'National Highway', pct: 74 },
                { label: 'West District', pct: 55 },
                { label: 'East District', pct: 68 },
                { label: 'Market Area', pct: 83 },
              ].map((row) => (
                <div key={row.label} className="coverage-row">
                  <span className="coverage-label">{row.label}</span>
                  <div className="coverage-bar-track">
                    <div className="coverage-bar-fill" style={{ '--pct': `${row.pct}%` }} />
                  </div>
                  <span className="coverage-pct">{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
