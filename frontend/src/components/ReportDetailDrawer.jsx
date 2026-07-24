import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

function ReportDetailDrawer({ report, formatDateTime, onClose, onDownload }) {
  const closeButtonRef = useRef(null)

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
                <dt>Incident location</dt>
                <dd>{report.location}</dd>
              </div>
            </dl>
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
