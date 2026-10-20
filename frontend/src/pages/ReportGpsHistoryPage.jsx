import { requestErrorMessage } from '../utils/requestFeedback'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Route } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'
import { SkeletonBlock } from '../components/LoadingSkeleton'
import { getReport, getReportRoute } from '../services/operations'
import { formatReportDateTime } from '../features/reports/reportPresentation'

const ReportLocationMap = lazy(() => import('../components/ReportLocationMap'))

const emptyRoute = { status: 'idle', points: [], message: '', to: '', complete: null, roadMatching: null }

export function ReportGpsHistory({ report, backPath = '/reports', formatDateTime = formatReportDateTime }) {
  const [routeState, setRouteState] = useState(emptyRoute)
  const [vehicleTravel, setVehicleTravel] = useState(false)
  const routeRequestRef = useRef(null)

  const loadRoute = useCallback(async (roadMatch = false) => {
    routeRequestRef.current?.abort()
    const request = new AbortController()
    routeRequestRef.current = request
    setRouteState(previous => ({ ...previous, status: 'loading', message: '' }))
    try {
      const result = await getReportRoute(report.id, { roadMatch, signal: request.signal })
      if (request.signal.aborted || routeRequestRef.current !== request) return
      const points = [...(result?.points || [])].sort(
        (first, second) => new Date(first.recorded_at) - new Date(second.recorded_at),
      )
      setRouteState({
        status: points.length ? 'loaded' : 'empty',
        points,
        message: points.length ? '' : 'No GPS samples were captured for this report window.',
        to: result?.window?.to || '',
        complete: result?.window?.complete ?? null,
        roadMatching: result?.road_matching || null,
      })
    } catch (error) {
      if (request.signal.aborted || routeRequestRef.current !== request) return
      setRouteState(previous => ({
        ...previous,
        status: 'error',
        message: requestErrorMessage(error, { action: 'load the GPS route for this report' }),
      }))
    }
  }, [report.id])

  useEffect(() => {
    void loadRoute()
    return () => routeRequestRef.current?.abort()
  }, [loadRoute])

  return <div className="page-container fade-in p-3 p-md-4 report-gps-history">
    <header className="report-gps-history__header">
      <div>
        <a className="report-gps-history__back" href={backPath}><ArrowLeft aria-hidden="true" />Back to report</a>
        <h2 className="page-title">Officer GPS history</h2>
        <p className="page-subtitle">{report.id} · {report.title}</p>
      </div>
      <button type="button" className="report-route-history__button" onClick={() => loadRoute()}
        disabled={routeState.status === 'loading'}>
        <Route aria-hidden="true" />{routeState.status === 'loading' ? 'Loading route...' : 'Refresh route'}
      </button>
    </header>

    <section className="widget-card report-detail-section report-gps-history__panel" aria-label="Officer GPS history near report">
      <p className="report-gps-history__intro">
        Saved GPS snapshot from 30 minutes before to 15 minutes after the {report.is_incident ? 'incident' : 'activity'} time.
        Recorded GPS points are the original evidence; the filtered trace and any estimated road route are visual aids.
      </p>
      <Suspense fallback={<div className="report-location-map__empty" role="status">Loading GPS map...</div>}>
        <ReportLocationMap
          incident={{ latitude: report.latitude, longitude: report.longitude }}
          markerLabel={report.is_incident ? 'Reported incident' : 'Reported activity'}
          routePoints={routeState.points}
          roadMatching={routeState.roadMatching}
        />
      </Suspense>

      {routeState.status === 'loading' && <div className="report-route-loading-skeleton" role="status" aria-label="Loading officer route">
        <SkeletonBlock width="100%" height="0.7rem" />
        <SkeletonBlock width="76%" height="0.7rem" />
      </div>}
      {routeState.points.length > 0 && <p className="report-route-history__status">
        {routeState.points.length} GPS samples recorded from {formatDateTime(routeState.points[0]?.recorded_at)} to{' '}
        {formatDateTime(routeState.points.at(-1)?.recorded_at)}.
      </p>}
      {routeState.complete === false && <p className="report-route-history__status">
        Collection window open until {formatDateTime(routeState.to)}. Refresh route to include newer on-duty GPS readings.
        Missing readings are not filled in.
      </p>}
      {routeState.complete === true && <p className="report-route-history__status">
        Collection window ended at {formatDateTime(routeState.to)}. This does not guarantee continuous GPS coverage.
      </p>}
      {routeState.points.length > 0 && routeState.roadMatching?.available && <div className="report-route-layers">
        <label><input type="checkbox" checked={vehicleTravel}
          onChange={event => setVehicleTravel(event.target.checked)} />Vehicle travel on roads</label>
        <button type="button" className="report-route-history__button"
          disabled={!vehicleTravel || routeState.status === 'loading'}
          onClick={() => loadRoute(true)}>Estimate road route</button>
        <span>Use only for travel by vehicle on roads. Road matching estimates the path between recorded points.</span>
      </div>}
      {routeState.points.length > 0 && routeState.roadMatching?.available === false && <p className="report-route-history__status">
        Road estimates are not enabled. Recorded GPS points and the filtered trace remain available.
      </p>}
      {routeState.roadMatching && !['not_requested', 'matched', 'disabled'].includes(routeState.roadMatching.status) &&
        <p className="report-route-history__status">{routeState.roadMatching.status === 'partial'
          ? 'Only some segments could be matched confidently. Uncertain sections remain unconnected.'
          : routeState.roadMatching.status === 'insufficient_movement'
            ? 'Insufficient reliable movement to estimate a road route.'
            : routeState.roadMatching.status === 'trace_too_large'
              ? 'This trace exceeds the road estimation limit. Recorded GPS layers remain available.'
              : 'A confident road estimate is unavailable. Recorded GPS layers remain available.'}</p>}
      {['empty', 'error'].includes(routeState.status) && <p className={`report-route-history__status report-route-history__status--${routeState.status}`}>
        {routeState.message}
      </p>}
    </section>
  </div>
}

function ReportGpsHistoryPage() {
  const { reportId } = useParams()
  const location = useLocation()
  const [state, setState] = useState({ reportId: null, report: null, error: '' })
  const requestedBack = new URLSearchParams(location.search).get('back')
  const backPath = requestedBack?.startsWith('/reports?')
    && new URLSearchParams(requestedBack.slice('/reports?'.length)).get('report') === reportId
    ? requestedBack
    : `/reports?report=${encodeURIComponent(reportId)}`

  useEffect(() => {
    let current = true
    getReport(reportId).then(report => {
      if (current) setState({ reportId, report, error: '' })
    }).catch(error => {
      if (current) setState({ reportId, report: null, error: requestErrorMessage(error, { action: 'open this report' }) })
    })
    return () => { current = false }
  }, [reportId])

  if (state.reportId === reportId && state.error) return <div className="page-container p-3 p-md-4 report-gps-history">
    <a className="report-gps-history__back" href={backPath}><ArrowLeft aria-hidden="true" />Back to report</a>
    <p role="alert">{state.error}</p>
  </div>
  if (!state.report || state.report.id !== reportId) return <div className="page-container p-3 p-md-4" role="status">Loading report GPS history...</div>
  return <ReportGpsHistory key={reportId} report={state.report} backPath={backPath} />
}

export default ReportGpsHistoryPage
