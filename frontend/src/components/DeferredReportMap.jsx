import { lazy, Suspense, useEffect, useRef, useState } from 'react'

const ReportLocationMap = lazy(() => import('./ReportLocationMap'))
const placeholder = <div className="report-location-map__empty" role="status">Loading report map...</div>

export default function DeferredReportMap({ active, ...props }) {
  const container = useRef(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (!active || visible || !container.current) return undefined
    let cancelled = false
    const observer = new IntersectionObserver((entries) => {
      if (!cancelled && entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { root: container.current.closest('.report-detail-drawer__body'), rootMargin: '200px' })
    observer.observe(container.current)
    return () => { cancelled = true; observer.disconnect() }
  }, [active, visible])
  return <div ref={container} className="report-map-deferred">
    {visible ? <Suspense fallback={placeholder}>
      <ReportLocationMap {...props} active={active} />
    </Suspense> : placeholder}
  </div>
}
