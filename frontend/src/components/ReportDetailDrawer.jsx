import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Download, Route, X, XCircle } from 'lucide-react'
import ReportLocationMap from './ReportLocationMap'
import { getReportRoute } from '../services/operations'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const resolveEvidenceUrl = (assetUrl) => {
  if (!assetUrl) return ''
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl
  return `${API_URL}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`
}

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

function ReportDetailDrawer({
  report,
  formatDateTime,
  onClose,
  onDownload,
  onValidationChange,
  validationState,
}) {
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
    if (!report.id) {
      setRouteState({
        ...emptyRouteState,
        reportId: report.id,
        status: 'error',
        message: 'This report does not have enough information to load its route.',
      })
      return
    }

    setRouteState({
      ...emptyRouteState,
      reportId: report.id,
      status: 'loading',
    })

    try {
      const result = await getReportRoute(report.id)
      const points = [...(result?.points || [])].sort(
        (first, second) => new Date(first.recorded_at) - new Date(second.recorded_at),
      )
      setRouteState({
        reportId: report.id,
        status: points.length > 0 ? 'loaded' : 'empty',
        points,
        message: points.length > 0
          ? ''
          : 'No GPS samples were captured for this report window.',
        from: result?.window?.from || '',
        to: result?.window?.to || '',
      })
    } catch (error) {
      setRouteState({
        ...emptyRouteState,
        reportId: report.id,
        status: 'error',
        message: error.message,
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
            <X aria-hidden="true" />
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

          {report.is_incident && (
          <section className="report-detail-section report-review-panel">
            <div className="report-review-panel__heading">
              <div>
                <h4>COP review</h4>
                <p>Validated incident reports are included in operational analytics.</p>
              </div>
              <span className={`report-review-status report-review-status--${report.validation_status}`}>
                {report.validation_status}
              </span>
            </div>
            <div className="report-review-actions">
              <button
                type="button"
                className="report-review-button report-review-button--reject"
                onClick={() => onValidationChange('rejected')}
                disabled={validationState?.isSaving || report.validation_status === 'rejected'}
              >
                <XCircle aria-hidden="true" />
                Reject
              </button>
              <button
                type="button"
                className="report-review-button report-review-button--validate"
                onClick={() => onValidationChange('validated')}
                disabled={validationState?.isSaving || report.validation_status === 'validated'}
              >
                <CheckCircle2 aria-hidden="true" />
                {validationState?.isSaving ? 'Saving...' : 'Validate report'}
              </button>
            </div>
            {(validationState?.message || validationState?.error) && (
              <p
                className={`report-review-feedback ${validationState.error ? 'is-error' : ''}`}
                role="status"
              >
                {validationState.error || validationState.message}
              </p>
            )}
          </section>
          )}

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
                <span>Saved snapshot from 30 minutes before to 15 minutes after the report time</span>
              </div>
              <button
                type="button"
                className="report-route-history__button"
                onClick={handleLoadRoute}
                disabled={activeRouteState.status === 'loading'}
              >
                <Route aria-hidden="true" />
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

          {report.evidence_photo?.url && (
            <section className="report-detail-section">
              <h4>Photo evidence</h4>
              <figure className="report-evidence">
                <img
                  src={resolveEvidenceUrl(report.evidence_photo.url)}
                  alt={`Evidence attached to ${report.id}`}
                />
                <figcaption>
                  <span>
                    {report.evidence_photo.camera_facing === 'front'
                      ? 'Front camera'
                      : 'Back camera'}
                  </span>
                  {report.evidence_photo.captured_at && (
                    <span>{formatDateTime(report.evidence_photo.captured_at)}</span>
                  )}
                </figcaption>
              </figure>
            </section>
          )}

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
            <Download aria-hidden="true" />
            Download report
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  )
}

export default ReportDetailDrawer
