import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { getDutyGpsHistory } from '../services/personnel'
import { requestErrorMessage } from '../utils/requestFeedback'
import { checkpointDetails, historyTime, hourLabel, patrolLabel, phtDate } from '../utils/dutyGpsHistory'
import '../styles/dutyGpsHistory.css'

const HistoryMap = lazy(() => import('../components/ReportLocationMap'))
const EMPTY_POINTS = []
const statusLabel = { no_reading: 'No GPS reading', in_progress: 'Awaiting GPS reading', upcoming: 'Upcoming hour', expired: 'Outside retention period' }

export default function PersonnelGpsHistoryPage() {
  const { personnelId } = useParams()
  const [date, setDate] = useState(phtDate)
  const [dateBounds] = useState(() => ({ max: phtDate(), min: phtDate(Date.now() - 30 * 86400_000) }))
  const [deploymentId, setDeploymentId] = useState('')
  const [view, setView] = useState('hourly')
  const [hour, setHour] = useState('')
  const [roadMatch, setRoadMatch] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const requestedHour = view === 'detailed' ? hour : ''

  useEffect(() => {
    const request = new AbortController()
    const load = async () => {
      await Promise.resolve()
      if (request.signal.aborted) return
      setState({ loading: true, data: null, error: '' })
      try {
        let data = await getDutyGpsHistory({ personnelId, date, deploymentId, view, hour: requestedHour, roadMatch, signal: request.signal })
        if (request.signal.aborted) return
        // Fetch every detailed page before drawing, so a long duty never silently
        // displays only its first 1,000 readings. Cancellation applies to all pages.
        const points = [...data.points]
        while (data.next_cursor) {
          const page = await getDutyGpsHistory({ personnelId, date, deploymentId: data.duty.id, view, hour: requestedHour, cursor: data.next_cursor, signal: request.signal })
          if (request.signal.aborted) return
          points.push(...page.points)
          data = { ...data, next_cursor: page.next_cursor }
        }
        setState({ loading: false, data: { ...data, points }, error: '' })
      } catch (error) {
        if (!request.signal.aborted) setState({ loading: false, data: null, error: requestErrorMessage(error, { action: 'load personnel GPS history' }) })
      }
    }
    void load()
    return () => request.abort()
  }, [date, deploymentId, requestedHour, personnelId, refresh, roadMatch, view])

  const data = state.data
  const selectedHour = data?.hours.find(item => String(item.hour) === hour)
  const resetSelection = () => { setHour(''); setRoadMatch(false) }
  return <div className="page-container fade-in p-3 p-md-4 duty-gps-history">
    <header className="reports-header mb-3">
      <div>
        <Link to="/personnel" className="report-gps-history__back"><ArrowLeft aria-hidden="true" />Back to personnel</Link>
        <h2 className="page-title">Personnel GPS history</h2>
        <p className="page-subtitle">{data?.personnel.name || personnelId}{data?.personnel.rank ? ` · ${data.personnel.rank} · ${data.personnel.badge}` : ''}</p>
      </div>
      <button type="button" className="report-action-btn report-action-btn--secondary" disabled={state.loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw aria-hidden="true" />Refresh history</button>
    </header>
    <section className="widget-card duty-gps-history__panel">
      <div className="duty-gps-history__filters">
        <label>Date (PHT)<input type="date" value={date} max={dateBounds.max} min={dateBounds.min}
          onChange={event => { if (!event.target.value) return; setDate(event.target.value); setDeploymentId(''); resetSelection() }} /></label>
        <label>Duty shift<select value={deploymentId || data?.duty?.id || ''} disabled={state.loading || !data?.shifts.length}
          onChange={event => { setDeploymentId(event.target.value); resetSelection() }}>
          {!data?.shifts.length && <option value="">No duty for this date</option>}
          {data?.shifts.map(duty => <option key={duty.id} value={duty.id}>{historyTime(duty.shiftStart)} – {historyTime(duty.shiftEnd)} · {duty.patrolArea}</option>)}
        </select></label>
        <label>Display<select value={view} onChange={event => { setView(event.target.value); setRoadMatch(false) }}>
          <option value="hourly">Hourly checkpoints</option><option value="detailed">Detailed GPS trace</option>
        </select></label>
        <label>Hour<select value={hour} disabled={state.loading || !data?.hours.length} onChange={event => { setHour(event.target.value); setRoadMatch(false) }}>
          <option value="">Full duty</option>{data?.hours.map(item => <option key={item.hour} value={item.hour}>Hour {item.hour + 1}: {hourLabel(item)}</option>)}
        </select></label>
      </div>
      <p className="duty-gps-history__note">Saved for 30 days. Times use Philippine time. Sleeping and offline devices do not create new GPS readings.</p>
      {state.loading && <p role="status">Loading GPS history…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {data && !data.duty && <p>No duty GPS history is available for this date. Choose another date.</p>}
      {data?.duty && <>
        <h3>{patrolLabel(data.duty)} · {data.duty.patrolArea}</h3>
        <p>{historyTime(data.duty.shiftStart)} – {historyTime(data.duty.shiftEnd)} PHT</p>
        <p className="duty-gps-history__note">{view === 'hourly'
          ? 'Each numbered checkpoint is the last accepted GPS reading in that duty hour. Dashed arrows show the order of hourly locations; they do not establish the route travelled.'
          : 'Detailed GPS trace uses accepted recorded positions. Gaps over one minute and unreliable movement remain unconnected; a GPS trace cannot prove the exact road or footpath travelled.'}</p>
        <Suspense fallback={<p role="status">Loading history map…</p>}>
          <HistoryMap mapLabel="Personnel duty GPS history map" emptyMessage="No accepted GPS readings are available for this selection."
            hourlyCheckpoints={view === 'hourly' ? data.hours : undefined} onSelectHour={setHour}
            routePoints={view === 'detailed' ? data.points : EMPTY_POINTS} roadMatching={data.road_matching} />
        </Suspense>
        {view === 'detailed' && <p>{data.points.length} accepted GPS readings in this selection.</p>}
        {view === 'detailed' && data.duty.patrolMode === 'car' && hour !== '' && <label className="duty-gps-history__road-option">
          <input type="checkbox" checked={roadMatch} onChange={event => setRoadMatch(event.target.checked)} />Estimate road route for this hour (OSRM, optional)
        </label>}
        {roadMatch && <p>{data.road_matching?.segments?.length ? 'Purple lines are an estimated road route between GPS samples.'
          : 'A road estimate is unavailable for this selection. The recorded GPS trace remains available.'}</p>}
        <h3>Hourly records</h3>
        <div className="duty-gps-history__hours">
          {data.hours.map(item => <button type="button" key={item.hour} aria-pressed={hour === String(item.hour)}
            className={`duty-gps-hour${hour === String(item.hour) ? ' is-selected' : ''}`} onClick={() => { setHour(String(item.hour)); setRoadMatch(false) }}>
            <strong>{item.hour + 1}. {hourLabel(item)}</strong><span>{item.checkpoint ? historyTime(item.checkpoint.recorded_at) + ' PHT' : statusLabel[item.status]}</span>
            {item.checkpoint && <span>{item.checkpoint.location_name || `${Number(item.checkpoint.latitude).toFixed(6)}, ${Number(item.checkpoint.longitude).toFixed(6)}`}</span>}
          </button>)}
        </div>
        {selectedHour && <section className="duty-gps-history__details" aria-label="Selected hourly checkpoint details">
          <h3>Hour {selectedHour.hour + 1} details</h3><p>{checkpointDetails(selectedHour)}</p>
          <p>{data.duty.personnelName} · {data.duty.rank} · {data.duty.badge} · {patrolLabel(data.duty)} · {data.duty.patrolArea}</p>
          {selectedHour.checkpoint?.device_assignment_id && <p>GPS assignment: {selectedHour.checkpoint.device_assignment_id}</p>}
        </section>}
      </>}
    </section>
  </div>
}
