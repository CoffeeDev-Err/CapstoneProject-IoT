import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock3, History, Info, MapPin, RefreshCw, Route } from 'lucide-react'
import InitialsAvatar from '../components/InitialsAvatar'
import SelectControl from '../components/SelectControl'
import { useDutyGpsHistory } from '../hooks/useDutyGpsHistory'
import { hourLabel, patrolLabel, phtDate } from '../utils/dutyGpsHistory'
import '../styles/dutyGpsHistory.css'

const HistoryMap = lazy(() => import('../components/ReportLocationMap'))
const EMPTY_POINTS = []
const shiftTime = value => new Date(value).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

export default function PersonnelGpsHistoryPage() {
  const { personnelId } = useParams()
  const [dateBounds] = useState(() => ({ max: phtDate(), min: phtDate(Date.now() - 30 * 86400_000) }))
  const state = useDutyGpsHistory(personnelId)
  const { date, deploymentId, view, hour, roadMatch } = state.selection
  const { updateSelection, retry } = state

  const data = state.data
  const visibleHours = useMemo(() => view === 'hourly' && data?.duty
    ? data.hours.filter(item => hour === '' || String(item.hour) === hour) : undefined, [data, hour, view])
  const historyContext = useMemo(() => ({ ...data?.duty,
    personnelName: data?.duty?.personnelName || data?.personnel?.name,
    rank: data?.duty?.rank || data?.personnel?.rank,
    badge: data?.duty?.badge || data?.personnel?.badge,
  }), [data])
  const pointCount = view === 'hourly' ? (visibleHours || []).filter(item => item.checkpoint).length : data?.duty ? data.points.length : 0
  const missingHours = (visibleHours || []).filter(item => !item.checkpoint && ['no_reading', 'expired'].includes(item.status)).length
  return <div className="page-container fade-in p-3 p-md-4 duty-gps-history">
    <header className="duty-gps-history__header">
      <div>
        <Link to="/personnel" className="duty-gps-history__back"><ArrowLeft aria-hidden="true" />Personnel</Link>
        <h2 className="page-title">GPS history</h2>
        <p className="page-subtitle">Explore saved duty locations on the map.</p>
      </div>
      <button type="button" className="report-action-btn report-action-btn--secondary" disabled={state.pending} onClick={retry}>
        <RefreshCw aria-hidden="true" className={state.pending ? 'history-refreshing' : ''} />Refresh history
      </button>
    </header>
    <section className="widget-card duty-gps-history__panel">
      <div className="duty-gps-history__officer">
        <InitialsAvatar name={data?.personnel.name || personnelId} className="duty-gps-history__avatar" />
        <div className="duty-gps-history__identity">
          <h3>{data?.personnel.name || personnelId}</h3>
          <p>{[data?.personnel.rank, data?.personnel.badge].filter(Boolean).join(' · ') || 'Personnel duty history'}</p>
        </div>
        <span className="duty-gps-history__retention"><Clock3 aria-hidden="true" />30-day history</span>
      </div>
      <div className="duty-gps-history__filters">
        <label className="history-date-filter"><span><CalendarDays aria-hidden="true" />Date (PHT)</span><input type="date" value={date} max={dateBounds.max} min={dateBounds.min}
          onChange={event => { if (event.target.value) updateSelection({ date: event.target.value, deploymentId: '', hour: '', roadMatch: false }) }} /></label>
        <label className="history-duty-filter"><span>Duty shift</span><SelectControl value={deploymentId || data?.duty?.id || ''} disabled={state.loading || !data?.shifts.length}
          onChange={event => updateSelection({ deploymentId: event.target.value, hour: '', roadMatch: false })}>
          {!data?.shifts.length && <option value="">No duty for this date</option>}
          {data?.shifts.map(duty => <option key={duty.id} value={duty.id}>{shiftTime(duty.shiftStart)} – {shiftTime(duty.shiftEnd)}</option>)}
        </SelectControl></label>
        <label className="history-hour-filter"><span>Hour</span><SelectControl value={hour} disabled={state.loading || !data?.hours.length} onChange={event => updateSelection({ hour: event.target.value, roadMatch: false })}>
          <option value="">Full duty</option>{data?.hours.map(item => <option key={item.hour} value={item.hour}>Hour {item.hour + 1} · {hourLabel(item)}</option>)}
        </SelectControl></label>
      </div>
      <div className="duty-gps-history__map-toolbar">
        <div className="history-view-switch" role="group" aria-label="Display">
          <button type="button" aria-pressed={view === 'hourly'} onClick={() => updateSelection({ view: 'hourly', roadMatch: false })}><History aria-hidden="true" />Hourly checkpoints</button>
          <button type="button" aria-pressed={view === 'detailed'} onClick={() => updateSelection({ view: 'detailed', roadMatch: false })}><Route aria-hidden="true" />Detailed GPS trace</button>
        </div>
        <span className="duty-gps-history__point-count" aria-live="polite">{state.loading ? 'Loading locations…'
          : `${pointCount} ${view === 'hourly' ? pointCount === 1 ? 'checkpoint' : 'checkpoints' : pointCount === 1 ? 'GPS reading' : 'GPS readings'}${missingHours ? ` · ${missingHours} ${missingHours === 1 ? 'hour' : 'hours'} without readings` : ''}`}</span>
      </div>
      <span className="visually-hidden" role="status">{state.pending && state.hasData ? 'Updating GPS history' : ''}</span>
      {state.error && state.hasData && <p role="alert" className="field-error">Could not refresh GPS history. Showing previously loaded locations. {state.error} <button type="button" className="report-action-btn" onClick={retry}>Retry</button></p>}
      <div className="duty-gps-history__map" aria-busy={state.loading}>
        <Suspense fallback={<div className="history-map-feedback" role="status">Loading history map…</div>}>
          <HistoryMap mapLabel="Personnel duty GPS history map" emptyMessage="No accepted GPS readings are available for this selection."
            historyContext={historyContext} hourlyCheckpoints={visibleHours}
            routePoints={view === 'detailed' && data?.duty ? data.points : EMPTY_POINTS} roadMatching={data?.road_matching} />
        </Suspense>
        {state.loading && <div className="history-map-feedback" role="status"><span className="history-map-feedback__loader" /><strong>Loading GPS history…</strong><span>Finding saved locations for this duty.</span></div>}
        {!state.loading && state.error && !state.hasData && <div className="history-map-feedback history-map-feedback--error" role="alert"><Info aria-hidden="true" /><strong>History could not be loaded</strong><p>{state.error}</p><button type="button" className="report-action-btn report-action-btn--secondary" onClick={retry}>Try again</button></div>}
        {!state.loading && !state.error && pointCount === 0 && <div className="history-map-feedback" role="status"><MapPin aria-hidden="true" />
          <strong>{!data?.duty ? 'No duty history for this date' : hour === '' ? 'No GPS readings for this duty' : 'No GPS readings for this hour'}</strong>
          <p>Choose another {hour === '' ? 'date or duty shift' : 'hour'}. Saved locations will appear here automatically.</p>
        </div>}
      </div>
      <footer className="duty-gps-history__footer">
        <div className="duty-gps-history__caption"><MapPin aria-hidden="true" /><span>{data?.duty ? `${patrolLabel(data.duty)} · ${data.duty.patrolArea}` : 'Personnel duty locations'}</span></div>
        <p>{view === 'hourly' ? 'Hover or select a dot for location, date and GPS details. Dashed arrows show location order.'
          : 'Hover or select a recorded point for details. Gaps in readings remain unconnected.'}</p>
        {view === 'detailed' && data?.duty?.patrolMode === 'car' && hour !== '' && <label className="duty-gps-history__road-option">
          <input type="checkbox" checked={roadMatch} onChange={event => updateSelection({ roadMatch: event.target.checked })} />Estimate road route for this hour
        </label>}
        {roadMatch && <p>{data?.road_matching?.segments?.length ? 'The purple road route is an estimate between GPS samples.' : 'A road estimate is unavailable. Recorded GPS points remain available.'}</p>}
        <details className="history-reading-note"><summary><Info aria-hidden="true" />About these readings</summary><p>All times use Philippine time (PHT). Hourly dots show the last accepted reading in each duty hour. GPS positions are approximate; connecting lines do not establish the exact path travelled. Sleeping and offline devices do not create new readings. Available readings are retained for 30 days.</p></details>
      </footer>
    </section>
  </div>
}
