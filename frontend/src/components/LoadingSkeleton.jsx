const skeletonWidth = (rowIndex, columnIndex) => (
  `${58 + ((rowIndex * 17 + columnIndex * 11) % 34)}%`
)

export function SkeletonBlock({ className = '', height, width }) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{ height, width }}
      aria-hidden="true"
    />
  )
}

export function PageLoadingSkeleton({ label = 'Loading page' }) {
  return (
    <div className="page-loading-skeleton" role="status" aria-live="polite" aria-label={label}>
      <div className="page-loading-skeleton__header">
        <SkeletonBlock width="12rem" height="1.65rem" />
        <SkeletonBlock width="18rem" height="0.8rem" />
      </div>
      <div className="page-loading-skeleton__cards">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="page-loading-skeleton__card" key={index}>
            <SkeletonBlock width="48%" height="0.7rem" />
            <SkeletonBlock width="32%" height="1.8rem" />
            <SkeletonBlock width="72%" height="0.7rem" />
          </div>
        ))}
      </div>
      <div className="page-loading-skeleton__panel">
        <SkeletonBlock width="10rem" height="1rem" />
        <SkeletonBlock width="100%" height="0.8rem" />
        <SkeletonBlock width="88%" height="0.8rem" />
        <SkeletonBlock width="94%" height="0.8rem" />
      </div>
    </div>
  )
}

export function AuthLoadingSkeleton() {
  return (
    <div className="auth-loading-skeleton">
      <div className="auth-loading-skeleton__card">
        <SkeletonBlock className="skeleton-block--circle" width="3.5rem" height="3.5rem" />
        <SkeletonBlock width="11rem" height="1.35rem" />
        <SkeletonBlock width="16rem" height="0.75rem" />
        <SkeletonBlock width="100%" height="2.75rem" />
        <SkeletonBlock width="100%" height="2.75rem" />
      </div>
      <span className="visually-hidden" role="status">Checking secure session</span>
    </div>
  )
}

export function TableSkeletonRows({ columns, rows = 5, label = 'Loading data' }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr className="skeleton-table-row" key={rowIndex} aria-hidden={rowIndex > 0 ? 'true' : undefined}>
      {Array.from({ length: columns }, (_, columnIndex) => (
        <td key={columnIndex}>
          {rowIndex === 0 && columnIndex === 0 && (
            <span className="visually-hidden" role="status">{label}</span>
          )}
          <SkeletonBlock width={skeletonWidth(rowIndex, columnIndex)} height="0.75rem" />
        </td>
      ))}
    </tr>
  ))
}

export function ReportListSkeleton({ rows = 5 }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <div className="report-list__row skeleton-report-row" role="row" key={rowIndex} aria-hidden={rowIndex > 0 ? 'true' : undefined}>
      {rowIndex === 0 && <span className="visually-hidden" role="status">Loading reports</span>}
      <div className="skeleton-report-row__identity" role="cell">
        <SkeletonBlock className="skeleton-block--circle" width="2.25rem" height="2.25rem" />
        <div>
          <SkeletonBlock width="8rem" height="0.75rem" />
          <SkeletonBlock width="5rem" height="0.6rem" />
        </div>
      </div>
      <SkeletonBlock width="4rem" height="1.25rem" />
      <SkeletonBlock width="3rem" height="1.25rem" />
      <SkeletonBlock width="5rem" height="1.25rem" />
      <SkeletonBlock width="7rem" height="0.75rem" />
      <SkeletonBlock width="9rem" height="0.75rem" />
      <SkeletonBlock width="8rem" height="2rem" />
    </div>
  ))
}

export function DashboardContentSkeleton() {
  return (
    <div role="status" aria-label="Loading operational summary">
      <div className="stats-grid row g-3 mb-3 mx-0">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card h-100 skeleton-dashboard-card">
              <SkeletonBlock width="58%" height="0.7rem" />
              <SkeletonBlock width="30%" height="2rem" />
              <SkeletonBlock width="78%" height="0.7rem" />
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-widgets row g-3 mx-0">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="col-12 col-xl-6">
            <div className="widget-card h-100 skeleton-dashboard-panel">
              <SkeletonBlock width="10rem" height="1rem" />
              <SkeletonBlock width="100%" height="0.8rem" />
              <SkeletonBlock width="86%" height="0.8rem" />
              <SkeletonBlock width="94%" height="0.8rem" />
              <SkeletonBlock width="72%" height="0.8rem" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsContentSkeleton() {
  return (
    <div role="status" aria-label="Loading analytics">
      <div className="stats-grid analytics-stats-grid row g-3 mb-3 mx-0">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="col-12 col-sm-6 col-xl-3">
            <div className="stat-card h-100 skeleton-dashboard-card">
              <SkeletonBlock width="62%" height="0.7rem" />
              <SkeletonBlock width="28%" height="2rem" />
              <SkeletonBlock width="74%" height="0.7rem" />
            </div>
          </div>
        ))}
      </div>
      <div className="widget-card skeleton-analytics-panel">
        <SkeletonBlock width="14rem" height="1rem" />
        <SkeletonBlock width="22rem" height="0.7rem" />
        <div className="skeleton-analytics-panel__columns">
          <div>
            <SkeletonBlock width="48%" height="0.75rem" />
            <SkeletonBlock width="100%" height="0.8rem" />
            <SkeletonBlock width="84%" height="0.8rem" />
            <SkeletonBlock width="68%" height="0.8rem" />
          </div>
          <div>
            <SkeletonBlock width="44%" height="0.75rem" />
            <SkeletonBlock width="100%" height="3rem" />
            <SkeletonBlock width="100%" height="3rem" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function MonitoringContentSkeleton() {
  return (
    <div className="monitoring-loading-skeleton" role="status" aria-label="Loading live operations map">
      <aside className="monitoring-loading-skeleton__side">
        <SkeletonBlock width="58%" height="1rem" />
        <SkeletonBlock width="100%" height="4rem" />
        <SkeletonBlock width="100%" height="4rem" />
        <SkeletonBlock width="72%" height="0.8rem" />
        <SkeletonBlock width="100%" height="2.75rem" />
        <SkeletonBlock width="100%" height="2.75rem" />
        <SkeletonBlock width="100%" height="2.75rem" />
      </aside>
      <section className="monitoring-loading-skeleton__map">
        <div className="monitoring-loading-skeleton__controls">
          <SkeletonBlock width="2.5rem" height="2.5rem" />
          <SkeletonBlock width="2.5rem" height="2.5rem" />
        </div>
        <SkeletonBlock className="skeleton-block--circle monitoring-loading-skeleton__marker" width="2.8rem" height="2.8rem" />
      </section>
    </div>
  )
}

export function EvidenceLoadingSkeleton() {
  return (
    <section className="evidence-viewer__panel evidence-loading-skeleton" role="status" aria-label="Loading protected evidence">
      <header className="evidence-loading-skeleton__heading">
        <div>
          <SkeletonBlock width="7rem" height="0.65rem" />
          <SkeletonBlock width="18rem" height="1.5rem" />
          <SkeletonBlock width="14rem" height="0.75rem" />
        </div>
        <SkeletonBlock width="9rem" height="2.5rem" />
      </header>
      <SkeletonBlock className="evidence-loading-skeleton__image" width="100%" height="26rem" />
      <div className="evidence-loading-skeleton__metadata">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <SkeletonBlock width="55%" height="0.6rem" />
            <SkeletonBlock width="82%" height="0.8rem" />
          </div>
        ))}
      </div>
    </section>
  )
}
