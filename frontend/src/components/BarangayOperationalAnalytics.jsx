import { useMemo, useState } from 'react'
import {
  DEPLOYMENT_PRIORITY_WEIGHTS,
} from '../utils/barangayAnalytics'

const METRIC_OPTIONS = [
  { value: 'reports', label: 'Submitted reports' },
  { value: 'incidents', label: 'Validated incidents' },
]

const SCORE_BREAKDOWN_ITEMS = [
  {
    key: 'incidentVolume',
    label: 'Incident volume',
    weight: DEPLOYMENT_PRIORITY_WEIGHTS.incidentVolume,
  },
  {
    key: 'severity',
    label: 'Severity',
    weight: DEPLOYMENT_PRIORITY_WEIGHTS.severity,
  },
  {
    key: 'repeatLocations',
    label: 'Repeat locations',
    weight: DEPLOYMENT_PRIORITY_WEIGHTS.repeatLocations,
  },
  {
    key: 'timePattern',
    label: 'Time pattern',
    weight: DEPLOYMENT_PRIORITY_WEIGHTS.timePattern,
  },
  {
    key: 'coverageGap',
    label: 'Coverage gap',
    weight: DEPLOYMENT_PRIORITY_WEIGHTS.coverageGap,
  },
]

const getMetricValue = (barangay, metric) => Number(
  metric === 'incidents' ? barangay.validatedIncidentCount : barangay.reportCount,
) || 0

function BarangayOperationalAnalytics({ analytics, period }) {
  const [metric, setMetric] = useState('reports')
  const [selectedBarangayName, setSelectedBarangayName] = useState('')

  const metricRanking = useMemo(
    () => analytics.barangays
      .filter((barangay) => getMetricValue(barangay, metric) > 0)
      .sort((first, second) => (
        getMetricValue(second, metric) - getMetricValue(first, metric)
        || second.priorityScore - first.priorityScore
        || first.barangay.localeCompare(second.barangay)
      )),
    [analytics.barangays, metric],
  )
  const maximumMetricValue = Math.max(0, ...metricRanking.map((barangay) => getMetricValue(barangay, metric)))
  const selectedBarangay = analytics.barangays.find(
    (barangay) => barangay.barangay === selectedBarangayName
  ) || analytics.barangays[0]
  const highestActivityBarangay = metricRanking[0]

  return (
    <section className="widget-card slide-up barangay-analytics">
      <header className="barangay-analytics__header">
        <div>
          <h3 className="widget-title mb-0">Barangay operational analytics</h3>
          <p>Report activity and explainable deployment priority for {analytics.periodLabel}</p>
        </div>

      </header>

      <div className="barangay-analytics__summary">
        <div>
          <span>Highest activity</span>
          <strong>{highestActivityBarangay?.barangay || '-'}</strong>
          <small>{getMetricValue(highestActivityBarangay || {}, metric)} {metric === 'incidents' ? 'incidents' : 'reports'}</small>
        </div>
        <div>
          <span>Validated incidents</span>
          <strong>{analytics.totalValidatedIncidents}</strong>
          <small>{analytics.periodLabel}</small>
        </div>
        <div>
          <span>High priority areas</span>
          <strong>{analytics.highPriorityBarangays}</strong>
          <small>High or Critical</small>
        </div>
      </div>

      <div className="barangay-analytics__workspace">
        <section className="barangay-activity-section" aria-labelledby="barangay-activity-title">
          <div className="barangay-analytics__section-header">
            <div>
              <h4 id="barangay-activity-title">Reports by barangay</h4>
              <span>Sorted from highest to lowest activity</span>
            </div>

            <div
              className="analytics-segmented-control analytics-segmented-control--compact smooth-underline-control"
              aria-label="Barangay activity metric"
              style={{ '--smooth-underline-left': metric === 'reports' ? '25%' : '75%' }}
            >
              {METRIC_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={metric === option.value ? 'is-active' : ''}
                  onClick={() => setMetric(option.value)}
                  aria-pressed={metric === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div key={`${period}-${metric}`} className="barangay-bar-list">
            {metricRanking.length === 0 && (
              <div className="barangay-analytics__empty">
                No {metric === 'incidents' ? 'validated incidents' : 'submitted reports'} for this period.
              </div>
            )}
            {metricRanking.map((barangay) => {
              const value = getMetricValue(barangay, metric)
              const width = maximumMetricValue > 0 ? (value / maximumMetricValue) * 100 : 0

              return (
                <button
                  key={barangay.barangay}
                  type="button"
                  className={`barangay-bar-row ${selectedBarangay?.barangay === barangay.barangay ? 'is-selected' : ''}`}
                  onClick={() => setSelectedBarangayName(barangay.barangay)}
                  aria-label={`${barangay.barangay}: ${value} ${metric}`}
                >
                  <span className="barangay-bar-row__label">{barangay.barangay}</span>
                  <span className="barangay-bar-row__track" aria-hidden="true">
                    <span style={{ '--bar-width': `${width}%` }} />
                  </span>
                  <strong>{value}</strong>
                </button>
              )
            })}
          </div>
        </section>

        <section className="barangay-priority-section" aria-labelledby="barangay-priority-title">
          <div className="barangay-analytics__section-header">
            <div>
              <h4 id="barangay-priority-title">Deployment priority</h4>
              <span>Weighted operational indicators</span>
            </div>
          </div>

          <div className="barangay-priority-list">
            {analytics.barangays.length === 0 && (
              <div className="barangay-analytics__empty">
                No barangay report activity for this period.
              </div>
            )}
            {analytics.barangays.map((barangay, index) => (
              <button
                key={barangay.barangay}
                type="button"
                className={`barangay-priority-row ${selectedBarangay?.barangay === barangay.barangay ? 'is-selected' : ''}`}
                onClick={() => setSelectedBarangayName(barangay.barangay)}
              >
                <span className="barangay-priority-row__rank">{index + 1}</span>
                <span className="barangay-priority-row__name">
                  <strong>{barangay.barangay}</strong>
                  <small>{barangay.validatedIncidentCount} validated incidents</small>
                </span>
                <span className={`priority-level priority-level--${barangay.priorityLevel.toLowerCase()}`}>
                  {barangay.priorityLevel}
                </span>
                <strong className="barangay-priority-row__score">{barangay.priorityScore}</strong>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedBarangay && (
        <section className="barangay-drilldown" aria-labelledby="barangay-drilldown-title">
          <header className="barangay-drilldown__header">
            <div>
              <span>Selected barangay</span>
              <h4 id="barangay-drilldown-title">{selectedBarangay.barangay}</h4>
            </div>
            <div className="barangay-drilldown__priority">
              <span className={`priority-level priority-level--${selectedBarangay.priorityLevel.toLowerCase()}`}>
                {selectedBarangay.priorityLevel}
              </span>
              <strong>{selectedBarangay.priorityScore}<small>/100</small></strong>
            </div>
          </header>

          <div className="barangay-drilldown__content">
            <div className="priority-breakdown">
              <h5>Priority score breakdown</h5>
              {SCORE_BREAKDOWN_ITEMS.map((item) => {
                const value = selectedBarangay.scoreBreakdown[item.key]
                return (
                  <div className="priority-breakdown__row" key={item.key}>
                    <div>
                      <span>{item.label}</span>
                      <small>{Math.round(item.weight * 100)}% weight</small>
                    </div>
                    <span className="priority-breakdown__track" aria-hidden="true">
                      <span style={{ '--score-width': `${value}%` }} />
                    </span>
                    <strong>{value}</strong>
                  </div>
                )
              })}
            </div>

            <div className="priority-explanation">
              <h5>Why this priority</h5>
              <ul>
                {selectedBarangay.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="priority-recommendation">
                <span>Suggested action</span>
                <p>{selectedBarangay.recommendation}</p>
              </div>
            </div>
          </div>

          <footer className="barangay-drilldown__footer">
            <span>
              Coverage: {selectedBarangay.availablePersonnel} available of {selectedBarangay.requiredPersonnel} required
            </span>
            <small>Advisory score only. Final deployment remains with the supervisor.</small>
          </footer>
        </section>
      )}
    </section>
  )
}

export default BarangayOperationalAnalytics
