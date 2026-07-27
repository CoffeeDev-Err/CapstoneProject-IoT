import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReportLocationMap from './ReportLocationMap'
import { getPersonnelLocationHistory } from '../services/personnel'

const ROUTE_LOOKBACK_MS = 30 * 60 * 1000
const ROUTE_LOOKAHEAD_MS = 15 * 60 * 1000

const emptyRouteState = {
  reportId: null,
  status: 'idle',
  points: [],
  message: '',
  from: '',
  to: '',
}

const formatCoordinates = (latitude, longitude) => {
  if (
    latitude === null
    || latitude === undefined
    || latitude === ''
    || longitude === null
    || longitude === undefined
    || longitude === ''
  ) {
    return 'Unavailable'
  }

  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)

  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return 'Unavailable'
  }

  return `${parsedLatitude.toFixed(6)}, ${parsedLongitude.toFixed(6)}`
}

function ReportDetailDrawer({ report, formatDateTime, onClose, onDownload }) {
  const closeButtonRef = useRef(null)
  const [routeState, setRouteState] = useState(emptyRouteState)

  useEffect(() => {
    if (!report) {
      return undefined
    }

    const previouslyFocusedElement = document.activeElement
    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocusedElement?.focus?.()
    }
  }, [onClose, report])

  if (!report) {
    return null
  }

  const activeRouteState = routeState.reportId === report.id
    ? routeState
    : emptyRouteState
  const occurredAt = report.occurred_at || report.date_time
  const hasCoordinates = report.latitude !== null
    && report.latitude !== undefined
    && report.latitude !== ''
    && report.longitude !== null
    && report.longitude !== undefined
    && report.longitude !== ''
    && Number.isFinite(Number(report.latitude))
    && Number.isFinite(Number(report.longitude))
  const openStreetMapUrl = hasCoordinates
    ? `https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=18/${report.latitude}/${report.longitude}`
    : ''

  const handleLoadRoute = async () => {
    const eventTime = new Date(occurredAt)

    if (!report.personnel_id || Number.isNaN(eventTime.getTime())) {
      setRouteState({
        ...emptyRouteState,
        reportId: report.id,
        status: 'error',
        message: 'This report does not have enough information to load its route.',
      })
      return
    }

    const from = new Date(eventTime.getTime() - ROUTE_LOOKBACK_MS).toISOString()
    const to = new Date(eventTime.getTime() + ROUTE_LOOKAHEAD_MS).toISOString()
    setRouteState({
      ...emptyRouteState,
      reportId: report.id,
      status: 'loading',
      from,
      to,
    })

    try {
      const result = await getPersonnelLocationHistory({
        personnelId: report.personnel_id,
        from,
        to,
      })
      const points = [...result.points].sort(
        (first, second) => new Date(first.recorded_at) - new Date(second.recorded_at),
      )
      setRouteState({
        reportId: report.id,
        status: points.length > 0 ? 'loaded' : 'empty',
        points,
        message: points.length > 0
          ? ''
          : 'No GPS samples are available for this time window. Route samples currently expire after 24 hours.',
        from,
        to,
      })
    } catch (error) {
      setRouteState({
        ...emptyRouteState,
        reportId: report.id,
        status: 'error',
        message: error.message,
        from,
        to,
      })
    }
  }

  return createPortal(
    <div className="report-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="report-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="report-detail-drawer__header">
          <div>
            <span className="report-detail-drawer__eyebrow">Report {report.id}</span>
            <h3 id="report-detail-title">{report.title}</h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="report-detail-drawer__close"
            onClick={onClose}
            aria-label="Close report details"
            title="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="report-detail-drawer__summary">
          <span className={`report-type-badge report-type-badge--${report.report_type}`}>
            {report.report_type}
          </span>
          <div className="report-detail-drawer__submitted">
            <strong>{report.officer}</strong>
            <span>{formatDateTime(report.date_time)}</span>
          </div>
        </div>

        <div className="report-detail-drawer__body">
          <section className="report-detail-section">
            <h4>Report information</h4>
            <dl className="report-detail-list">
              <div>
                <dt>Report type</dt>
                <dd>{report.report_type}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{report.title}</dd>
              </div>
              <div>
                <dt>Occurred at</dt>
                <dd>{formatDateTime(occurredAt)}</dd>
              </div>
              <div>
                <dt>Assigned area</dt>
                <dd>{report.assigned_area}</dd>
              </div>
              <div>
                <dt>Barangay</dt>
                <dd>{report.barangay}</dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>{report.severity}/5</dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>{report.validation_status}</dd>
              </div>
              {report.is_incident && (
                <div>
                  <dt>Case status</dt>
                  <dd>{report.case_status || 'open'}</dd>
                </div>
              )}
              {report.resolved_at && (
                <div>
                  <dt>Resolved</dt>
                  <dd>{formatDateTime(report.resolved_at)}</dd>
                </div>
              )}
              <div>
                <dt>{report.is_incident ? 'Incident location' : 'Activity location'}</dt>
                <dd>{report.location}</dd>
              </div>
              <div>
                <dt>GPS coordinates</dt>
                <dd>{formatCoordinates(report.latitude, report.longitude)}</dd>
              </div>
            </dl>
          </section>

          <section className="report-detail-section">
            <div className="report-detail-section__header">
              <h4>Reported location and route</h4>
              {openStreetMapUrl && (
                <a href={openStreetMapUrl} target="_blank" rel="noreferrer">
                  Open full map
                </a>
              )}
            </div>

            <ReportLocationMap
              incident={{
                latitude: report.latitude,
                longitude: report.longitude,
              }}
              markerLabel={report.is_incident ? 'Reported incident' : 'Reported activity'}
              routePoints={activeRouteState.points}
            />

            <div className="report-route-history">
              <div>
                <strong>Officer route near report</strong>
                <span>30 minutes before to 15 minutes after the reported time</span>
              </div>
              <button
                type="button"
                className="report-route-history__button"
                onClick={handleLoadRoute}
                disabled={activeRouteState.status === 'loading'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 19h14M5 5h14M7 5v5l10 4v5" />
                  <circle cx="7" cy="5" r="2" />
                  <circle cx="17" cy="19" r="2" />
                </svg>
                {activeRouteState.status === 'loading'
                  ? 'Loading route...'
                  : activeRouteState.status === 'loaded'
                    ? 'Refresh route'
                    : 'Show route'}
              </button>
            </div>

            {activeRouteState.status === 'loaded' && (
              <p className="report-route-history__status">
                {activeRouteState.points.length} GPS samples shown from{' '}
                {formatDateTime(activeRouteState.from)} to {formatDateTime(activeRouteState.to)}.
              </p>
            )}
            {['empty', 'error'].includes(activeRouteState.status) && (
              <p className={`report-route-history__status report-route-history__status--${activeRouteState.status}`}>
                {activeRouteState.message}
              </p>
            )}
          </section>

          <section className="report-detail-section">
            <h4>Description</h4>
            <p>{report.description}</p>
          </section>

          {report.resolution_notes && (
            <section className="report-detail-section">
              <h4>Resolution notes</h4>
              <p>{report.resolution_notes}</p>
            </section>
          )}
        </div>

        <footer className="report-detail-drawer__footer">
          <button type="button" className="report-action-btn report-action-btn--secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="report-action-btn report-action-btn--primary"
            onClick={() => onDownload(report)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Download report
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  )
}

export default ReportDetailDrawer
