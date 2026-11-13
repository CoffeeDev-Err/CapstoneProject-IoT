import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Route, Trash2 } from 'lucide-react'
import { isInsideCabagan } from '../../utils/cabaganGeofence'
import PatrolMap from './PatrolMap'
import PatrolMapSearch from './PatrolMapSearch'
import PatrolDurationControl from './PatrolDurationControl'
import PatrolScheduleTimeline from './PatrolScheduleTimeline'
import useRouteDirections from './useRouteDirections'
import { blockOffset, blockTimeLabel, emptyPatrolBlock, moveItem } from './patrolScheduleView'

const numberRoutes = routes => routes.map((route, index) => route.autoLabel ? { ...route, label: `Route ${index + 1}` } : route)
const fitRouteSlots = (current, minutes) => {
  const last = current.findLastIndex(route => route.routePoints?.length || route.durationEdited || route.autoLabel === false)
  const routes = current.slice(0, last + 1)
  let remaining = minutes - routes.reduce((sum, route) => sum + Number(route.durationMinutes), 0)
  if (!Number.isFinite(remaining) || remaining < 15 || minutes > 1440) return numberRoutes(routes)
  while (remaining >= 15 && routes.length < 48) {
    const duration = remaining <= 134 ? remaining : 120
    routes.push({ ...emptyPatrolBlock(), coverageType: 'route', label: `Route ${routes.length + 1}`, autoLabel: true, durationMinutes: duration })
    remaining -= duration
  }
  return numberRoutes(routes)
}

export default function PatrolRouteScheduleBuilder({ ref, initialBlocks, start, dutyMinutes, dutyError, mode, graceMinutes, onGraceChange, onDirtyChange, onCommit }) {
  const [state, setState] = useState(() => ({ minutes: dutyMinutes, routes: fitRouteSlots(initialBlocks.map(block => ({ ...emptyPatrolBlock(), ...block })), dutyMinutes) }))
  const [saved, setSaved] = useState(() => JSON.stringify({ mode, routes: initialBlocks.map(block => ({ ...emptyPatrolBlock(), ...block })) }))
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [focus, setFocus] = useState(null)
  const [message, setMessage] = useState('')
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' })
  const config = useRef(null)
  const routes = useMemo(() => state.minutes === dutyMinutes ? state.routes : fitRouteSlots(state.routes, dutyMinutes), [state, dutyMinutes])
  const index = Math.min(active, Math.max(0, routes.length - 1))
  const selected = routes[index]
  const directions = useRouteDirections(routes.map(route => route.routePoints || []), mode)
  const resolved = routes.map((route, i) => ({ ...route, offsetMinutes: blockOffset(routes, i), geometry: directions.results[i]?.available ? directions.results[i].geometry : mode === 'walk' && route.routePoints.length >= 2 ? { type: 'LineString', coordinates: route.routePoints.map(point => [point.longitude, point.latitude]) } : null, roadDirections: Boolean(directions.results[i]?.available) }))
  const dirty = JSON.stringify({ mode, routes }) !== saved
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  const setRoutes = updater => setState({ minutes: dutyMinutes, routes: typeof updater === 'function' ? updater(routes) : updater })
  const update = patch => { setRoutes(current => current.map((route, i) => i === index ? { ...route, ...patch } : route)); setMessage('') }
  const select = i => {
    setActive(i); setExpanded(i); setMessage('')
    const point = routes[i]?.routePoints?.[0]
    if (point) setFocus(point)
    if (config.current) { config.current.open = true; config.current.scrollTop = 0 }
  }
  const remove = i => { setRoutes(fitRouteSlots(routes.filter((_, n) => n !== i), dutyMinutes)); setActive(0); setExpanded(null); setMessage('Route removed. Complete the remaining time blocks before saving.') }
  const move = (from, to) => { setRoutes(numberRoutes(moveItem(routes, from, to))); setActive(to); setExpanded(to) }
  useImperativeHandle(ref, () => ({ edit: select, remove, move, reset: () => { setState({ minutes: dutyMinutes, routes: fitRouteSlots([], dutyMinutes) }); setSaved('[]'); setActive(0); setFocus(null); setMessage('') } }))
  const addPoint = point => {
    if (!selected || dutyError) return setMessage('Correct the duty hours before selecting a route.')
    if (!isInsideCabagan(point.latitude, point.longitude)) return setMessage('Choose a location inside the Cabagan boundary.')
    if (selected.routePoints.length >= 30) return setMessage('Each route supports up to 30 points.')
    update({ routePoints: [...selected.routePoints, { ...point, label: point.label || `Point ${selected.routePoints.length + 1}` }] })
    setCoordinates({ latitude: '', longitude: '' })
  }
  const total = routes.reduce((sum, route) => sum + Number(route.durationMinutes), 0)
  const invalid = routes.findIndex(route => !route.label.trim() || route.routePoints.length < 2 || !Number.isInteger(route.durationMinutes) || route.durationMinutes < 15 || route.durationMinutes > 1440 || !Number.isFinite(route.routeCorridorMeters) || route.routeCorridorMeters < 50 || route.routeCorridorMeters > 1000)
  const incomplete = dutyError || (invalid >= 0 ? `Complete route ${invalid + 1}: a name, at least two points, a valid duration and a 50–1,000 m corridor are required.` : total !== dutyMinutes ? `Route durations must fill the duty exactly (${total} / ${dutyMinutes} minutes).` : directions.loading ? 'Loading directions for the selected routes…' : !routes.length ? 'Choose valid duty hours to start selecting routes.' : '')
  const save = () => {
    if (incomplete) return
    onCommit(resolved.map(route => { const block = { ...route, label: route.label.trim() }; delete block.autoLabel; delete block.durationEdited; return block }))
    setSaved(JSON.stringify({ mode, routes })); setMessage('All routes saved. Continue to personnel and final review.')
  }
  return <>
    <div className="patrol-area-progress" role="status"><strong>{routes.filter(route => route.routePoints.length >= 2).length} / {routes.length} routes selected · {total} / {Number.isFinite(dutyMinutes) ? dutyMinutes : '—'} minutes</strong><span className={`patrol-badge ${dirty ? 'is-warning' : 'is-valid'}`}>{dirty ? 'Selection in progress' : 'Routes saved'}</span></div>
    <div className="patrol-workspace"><div className="patrol-workspace__map"><PatrolMapSearch onSelect={setFocus} />
      <PatrolMap blocks={resolved} type="route" mode={mode} start={start} autoFit={false} focus={focus} selectedIndex={index} onPoint={selected ? addPoint : undefined} onSelectBlock={select}>
        <nav className="patrol-area-numbers" aria-label="Route time blocks">{routes.map((route, i) => <button type="button" key={i} aria-label={`Go to route ${i + 1}: ${route.label}`} aria-pressed={index === i} className={index === i ? 'is-active' : ''} onClick={() => select(i)}>{i + 1}</button>)}</nav>
      </PatrolMap><p className="patrol-map-caption">Select points for the current route. Choose another numbered time block on the map to draw its route. Save all routes together.</p>
    </div><details ref={config} className="patrol-workspace__config" open><summary><Route size={16} />{selected ? `Route ${index + 1} configuration` : 'Route configuration'}</summary>
      <div className="patrol-workspace__fields">{selected && <>
        <label>Route name<input aria-label="Route name" maxLength={200} value={selected.label} onChange={e => update({ label: e.target.value, autoLabel: false })} /></label>
        <div className="patrol-tinted-panel"><strong>{blockTimeLabel(start, selected, blockOffset(routes, index))}</strong></div>
        <PatrolDurationControl value={selected.durationMinutes} remaining={dutyMinutes - routes.reduce((sum, route, i) => i !== index && (i < index || route.routePoints.length || route.durationEdited || route.autoLabel === false) ? sum + Number(route.durationMinutes) : sum, 0)} onChange={durationMinutes => { const next = routes.map((route, i) => i === index ? { ...route, durationMinutes, durationEdited: true } : route); setRoutes(fitRouteSlots(next, dutyMinutes)); setMessage('') }} />
        <label>Allowed distance from route (meters, each side)<input type="number" min={50} max={1000} value={selected.routeCorridorMeters} onChange={e => update({ routeCorridorMeters: Number(e.target.value) })} /></label>
        <ol className="patrol-route-points">{selected.routePoints.map((point, n) => <li key={n}><span className="patrol-step">{n + 1}</span><label><span className="visually-hidden">Route point {n + 1} label</span><input maxLength={200} value={point.label || ''} onChange={e => update({ routePoints: selected.routePoints.map((p, j) => j === n ? { ...p, label: e.target.value } : p) })} /><small>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</small></label><div className="patrol-route-points__actions"><button type="button" aria-label={`Move route point ${n + 1} up`} disabled={n === 0} onClick={() => update({ routePoints: moveItem(selected.routePoints, n, n - 1) })}><ArrowUp size={13} /></button><button type="button" aria-label={`Move route point ${n + 1} down`} disabled={n === selected.routePoints.length - 1} onClick={() => update({ routePoints: moveItem(selected.routePoints, n, n + 1) })}><ArrowDown size={13} /></button><button type="button" aria-label={`Remove route point ${n + 1}`} onClick={() => update({ routePoints: selected.routePoints.filter((_, j) => j !== n) })}><Trash2 size={13} /></button></div></li>)}</ol>
        {!directions.loading && selected.routePoints.length >= 2 && !resolved[index].roadDirections && <p className="patrol-notice is-warning">{mode === 'walk' ? 'Walking directions unavailable. Coverage uses your manually plotted path; include every walkway turn.' : 'Road directions unavailable. Route warnings cannot be enforced for this block.'} <button type="button" onClick={directions.retry}>Retry directions</button></p>}
        <label>Transition grace period (minutes)<input type="number" min={0} max={60} value={graceMinutes} onChange={e => onGraceChange(Number(e.target.value))} /></label><small>Time allowed to move between routes. It does not extend duty hours.</small>
        <details className="patrol-coordinate-entry"><summary>Enter exact coordinates</summary><div className="patrol-two-columns"><label>Latitude<input type="number" step="any" value={coordinates.latitude} onChange={e => setCoordinates(c => ({ ...c, latitude: e.target.value }))} /></label><label>Longitude<input type="number" step="any" value={coordinates.longitude} onChange={e => setCoordinates(c => ({ ...c, longitude: e.target.value }))} /></label></div><button type="button" disabled={!coordinates.latitude || !coordinates.longitude} onClick={() => addPoint({ latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) })}>Use coordinates</button></details>
      </>}</div><div className="patrol-area-config-footer"><p role="status">{message || incomplete || 'All route blocks are ready. Save the complete schedule.'}</p>{invalid >= 0 && invalid !== index && <button type="button" onClick={() => select(invalid)}>Complete route {invalid + 1}</button>}<div className="patrol-draft-actions"><button type="button" disabled={!selected} onClick={() => update({ routePoints: [] })}>Clear current route</button><button type="button" className="patrol-primary" disabled={Boolean(incomplete) || !dirty} onClick={save}><Check size={16} />Save routes</button></div></div>
    </details></div>
    <div className="patrol-saved-schedule"><h4>{dirty ? 'Selected routes' : 'Saved routes'}</h4><PatrolScheduleTimeline blocks={resolved} type="route" mode={mode} start={start} expanded={expanded} onExpand={setExpanded} onEdit={select} onDelete={remove} onMove={move} /></div>
  </>
}
