import { createElement, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Car, Check, ClipboardCheck, Clock3, Footprints, LockKeyhole, MapPin, Plus, Route, ShieldCheck, Trash2, Users } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'
import { isInsideCabagan } from '../../utils/cabaganGeofence'
import { createDeploymentId } from './deploymentForm'
import ConfirmModal from '../../components/ConfirmModal'
import WeeklyVehicleAssignments from './WeeklyVehicleAssignments'
import PatrolMap from './PatrolMap'
import PatrolMapSearch from './PatrolMapSearch'
import PatrolPersonnelSelect from './PatrolPersonnelSelect'
import PatrolDurationControl from './PatrolDurationControl'
import PatrolScheduleTimeline from './PatrolScheduleTimeline'
import PatrolScheduleDialog from './PatrolScheduleDialog'
import usePatrolDraftCoverage from './usePatrolDraftCoverage'
import { blockOffset, blockTimeLabel, emptyPatrolBlock, hasBlockCoverage, moveItem } from './patrolScheduleView'
import { weekFor, toPatrolLocalTime, patrolTime } from './patrolPlannerTime'
import '../../styles/patrol-planner.css'

export default function PatrolPlanner({ personnel, assignments, initialGroup = [], saving, ready, onSave, onCancel }) {
  const initial = initialGroup[0]
  const [groupId] = useState(() => initial?.groupId || createDeploymentId('GRP'))
  const [recordPrefix] = useState(() => createDeploymentId('DEP'))
  const [type, setType] = useState(initial?.deploymentType || 'area')
  const [mode, setMode] = useState(initial?.patrolMode || 'walk')
  const [start, setStart] = useState(() => toPatrolLocalTime(initial?.shiftStart || new Date()))
  const [end, setEnd] = useState(() => toPatrolLocalTime(initial?.shiftEnd || new Date(Date.now() + 8 * 3600000)))
  const [blocks, setBlocks] = useState(initial?.scheduleBlocks || [])
  const [draft, setDraft] = useState(emptyPatrolBlock)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(initial ? 0 : null)
  const [ids, setIds] = useState(initialGroup.map(a => a.personnelId))
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [graceMinutes, setGraceMinutes] = useState(initial?.transitionGraceMinutes ?? 10)
  const [fleet, setFleet] = useState({ vehicles: [], weeks: [] })
  const [fleetError, setFleetError] = useState('')
  const [fleetLoading, setFleetLoading] = useState(true)
  const [crewOpen, setCrewOpen] = useState(false)
  const [review, setReview] = useState(false)
  const [switchType, setSwitchType] = useState(null)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState(null)
  const [routesLoading, setRoutesLoading] = useState(false)
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' })
  const nameRef = useRef(null)
  const savingRef = useRef(false)
  const routingRevision = useRef(0)
  const coverage = usePatrolDraftCoverage(draft, type, mode)
  const loadFleet = async () => {
    try { setFleet(await apiRequest('/api/patrol/fleet')); setFleetError('') }
    catch (e) { setFleetError(e.message); throw e }
  }
  useEffect(() => {
    let active = true
    apiRequest('/api/patrol/fleet').then(data => { if (active) { setFleet(data); setFleetError('') } })
      .catch(e => { if (active) setFleetError(e.message) }).finally(() => { if (active) setFleetLoading(false) })
    return () => { active = false; routingRevision.current += 1 }
  }, [])
  const vehicleMode = type === 'route' && ['car', 'motorcycle'].includes(mode)
  const weekStart = weekFor(patrolTime(start))
  const week = fleet.weeks.find(w => w.weekStart === weekStart)
  const crew = vehicleMode ? week?.crews.find(c => c.vehicleId === vehicleId) : null
  const selectedIds = vehicleMode ? crew?.personnelIds || [] : ids
  const minutes = blocks.reduce((total, b) => total + Number(b.durationMinutes), 0)
  const dutyMinutes = Math.round((patrolTime(end) - patrolTime(start)) / 60000)
  const draftOffset = editing === null ? minutes : blockOffset(blocks, editing)
  const available = dutyMinutes - minutes + (editing === null ? 0 : Number(blocks[editing]?.durationMinutes || 0))
  const update = patch => { setDraft(current => ({ ...current, ...patch })); setError('') }
  const clearDraft = (remaining = dutyMinutes - minutes) => { setDraft(emptyPatrolBlock(remaining)); setEditing(null); setCoordinates({ latitude: '', longitude: '' }); setFocus(null); setError('') }
  const selectPoint = point => {
    if (!isInsideCabagan(point.latitude, point.longitude)) return setError('Choose a location inside the Cabagan boundary.')
    if (type === 'route') {
      if (draft.routePoints.length >= 30) return setError('A route supports a maximum of 30 points.')
      update({ routePoints: [...draft.routePoints, { ...point, label: point.label || `Point ${draft.routePoints.length + 1}` }], geometry: null, roadDirections: false })
    } else update({ latitude: point.latitude, longitude: point.longitude })
  }
  const saveBlock = () => {
    const resolved = { ...draft, ...(coverage.loading ? {} : coverage), coverageType: type === 'route' ? 'route' : draft.coverageType, label: draft.label.trim() }
    delete resolved.key; delete resolved.loading; delete resolved.message
    if (coverage.loading) return setError('Wait for the map coverage to finish loading.')
    if (!hasBlockCoverage(resolved, type)) return setError('Name the block and select its barangay, map coverage or at least two route points.')
    if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 15 || draft.durationMinutes > 1440) return setError('Choose a duration between 15 minutes and 24 hours.')
    if (type === 'area' && draft.coverageType === 'custom' && (!Number.isFinite(draft.radiusMeters) || draft.radiusMeters < 50 || draft.radiusMeters > 5000)) return setError('Coverage radius must be 50 to 5,000 meters.')
    if (type === 'route' && (!Number.isFinite(draft.routeCorridorMeters) || draft.routeCorridorMeters < 50 || draft.routeCorridorMeters > 1000)) return setError('The route corridor must be 50 to 1,000 meters on each side.')
    const next = editing === null ? [...blocks, resolved] : blocks.map((b, i) => i === editing ? resolved : b)
    setBlocks(next); setExpanded(editing ?? next.length - 1)
    clearDraft(dutyMinutes - next.reduce((total, b) => total + Number(b.durationMinutes), 0))
  }
  const editBlock = index => { setReview(false); setEditing(index); setDraft({ ...emptyPatrolBlock(), ...blocks[index] }); setExpanded(index); setError(''); nameRef.current?.focus() }
  const deleteBlock = index => { setBlocks(current => current.filter((_, i) => i !== index)); setExpanded(null); clearDraft(); setReview(false) }
  const reorderBlock = (from, to) => { setBlocks(current => moveItem(current, from, to)); setExpanded(to); clearDraft() }
  const changeType = value => { routingRevision.current += 1; setRoutesLoading(false); setType(value); setBlocks([]); clearDraft(dutyMinutes); setExpanded(null); setSwitchType(null) }
  const changeMode = async value => {
    if (value === mode) return
    const revision = ++routingRevision.current
    setMode(value); setVehicleId(''); update({ geometry: null, roadDirections: false })
    setBlocks(current => current.map(b => ({ ...b, geometry: null, roadDirections: false })))
    setRoutesLoading(true)
    const resolved = await Promise.all(blocks.map(async block => {
      let result
      try { result = await apiRequest('/api/patrol/directions', { method: 'POST', body: JSON.stringify({ points: block.routePoints, mode: value }) }) } catch { result = { available: false } }
      return { signature: JSON.stringify(block.routePoints), geometry: result.available ? result.geometry : value === 'walk' ? { type: 'LineString', coordinates: block.routePoints.map(p => [p.longitude, p.latitude]) } : null, roadDirections: Boolean(result.available) }
    }))
    if (revision !== routingRevision.current) return
    setBlocks(current => current.map(block => { const match = resolved.find(item => item.signature === JSON.stringify(block.routePoints)); return match ? { ...block, geometry: match.geometry, roadDirections: match.roadDirections } : block }))
    setRoutesLoading(false)
  }
  const validate = () => {
    if (!ready) return 'Wait for deployments to load before saving.'
    if (routesLoading) return 'Wait for the saved routes to update for this travel mode.'
    if (!Number.isFinite(dutyMinutes) || dutyMinutes <= 0 || dutyMinutes > 1440 || minutes !== dutyMinutes) return 'Schedule durations must fill the full duty exactly (maximum 24 hours).'
    if (draft.label.trim() || draft.routePoints.length || Number.isFinite(draft.latitude) || editing !== null) return `Save the current ${type} or clear its selection before reviewing.`
    if (!blocks.length || blocks.some(b => !hasBlockCoverage(b, type))) return 'Save at least one configured schedule block.'
    if (vehicleMode && (!crew || fleetLoading || fleetError)) return 'Set up the locked weekly crew for this vehicle before deployment.'
    if (vehicleMode && weekFor(new Date(+patrolTime(end) - 1)) !== weekStart) return 'Keep the complete vehicle duty within its locked Monday–Sunday crew assignment.'
    if (!selectedIds.length) return 'Select personnel or save this week’s vehicle crew first.'
    if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 60) return 'Transition grace period must be 0 to 60 minutes.'
    return ''
  }
  const buildAssignments = () => {
    return selectedIds.map(id => {
      const prior = initialGroup.find(a => a.personnelId === id)
      const member = personnel.find(p => p.id === id)
      return { id: prior?.id || `${recordPrefix}-${id}`, groupId, personnelId: id, personnelName: member?.name || prior?.personnelName || id, rank: member?.rank || prior?.rank || '',
        deploymentType: type, patrolMode: type === 'route' ? mode : '', vehicleId: vehicleMode ? vehicleId : '', vehicleCrew: vehicleMode ? crew : undefined,
        scheduleBlocks: blocks.map((b, i) => ({ ...b, offsetMinutes: blockOffset(blocks, i), durationMinutes: Number(b.durationMinutes) })),
        patrolArea: blocks[0]?.label || '', patrolAreaId: 'scheduled-patrol', notes, transitionGraceMinutes: graceMinutes,
        shiftStart: patrolTime(start).toISOString(), shiftEnd: patrolTime(end).toISOString(), status: +patrolTime(start) > Date.now() ? 'scheduled' : 'active' }
    })
  }
  const save = async () => {
    if (savingRef.current) return
    const message = validate()
    if (message) { setReview(false); return setError(message) }
    savingRef.current = true
    try {
      const next = buildAssignments()
      if (await onSave([...assignments.filter(a => !initialGroup.some(old => old.id === a.id)), ...next], initial ? 'Patrol deployment updated. Affected personnel have been notified.' : 'Patrol deployment saved.')) {
        setBlocks([]); clearDraft(); setIds([]); setVehicleId(''); setNotes(''); setReview(false); onCancel({ deploymentId: next[0].id })
      }
    } finally { savingRef.current = false }
  }
  const reviewGroup = review ? buildAssignments() : []
  const preview = { ...draft, ...(coverage.loading ? {} : coverage), offsetMinutes: draftOffset }
  const scheduleComplete = minutes === dutyMinutes && minutes > 0
  return <section className="patrol-planner patrol-theme">
    <header className="patrol-planner__header"><div><span className="patrol-eyebrow"><ShieldCheck size={16} /> Patrol operations</span><h3>{initial ? 'Reassign patrol deployment' : 'Plan a patrol duty'}</h3><p>Set the duty. Build the schedule on the map. Deploy your team.</p></div><span className="patrol-badge">Philippine time · UTC+8</span></header>
    <form onSubmit={event => { event.preventDefault(); const message = validate(); setError(message); if (!message) setReview(true) }}>
      <section className="patrol-panel"><div className="patrol-section-heading"><span className="patrol-step">01</span><div><h4>Patrol style & duty</h4><p>One duty, with consecutive area or route blocks.</p></div></div>
        <fieldset className="patrol-style-selector"><legend className="visually-hidden">Deployment style</legend>{[['area', 'Area Patrol', 'Cover a barangay or a custom area', ShieldCheck], ['route', 'Route Patrol', 'Follow a road or walking path', Route]].map(([value, label, hint, icon]) => <button type="button" key={value} aria-label={label} aria-pressed={type === value} className={type === value ? 'is-active' : ''} onClick={() => { if (type !== value) { if (blocks.length || draft.label || draft.routePoints.length || Number.isFinite(draft.latitude)) setSwitchType(value); else changeType(value) } }}>{createElement(icon, { size: 23 })}<span><strong>{label}</strong><small>{hint}</small></span>{type === value && <Check size={17} />}</button>)}</fieldset>
        {type === 'route' && <fieldset className="patrol-mode-selector"><legend>Travel mode</legend>{[['walk', 'Foot Patrol', Footprints], ['motorcycle', 'Motorcycle Patrol', Route], ['car', 'Car Patrol', Car]].map(([value, label, icon]) => <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => { void changeMode(value) }}>{createElement(icon, { size: 16 })}{label}</button>)}</fieldset>}
        <div className="patrol-two-columns patrol-duty"><label>Start<input required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label>End<input required type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      </section>
      <section className="patrol-panel patrol-schedule-panel"><div className="patrol-section-heading"><span className="patrol-step is-gold">02</span><div><h4>Build the {type} schedule</h4><p>Two hours per block by default. Use one full-duty block for a fixed assignment.</p></div><span className={`patrol-badge ${scheduleComplete ? 'is-valid' : 'is-warning'}`} role="status"><Clock3 size={14} />{minutes} / {Number.isFinite(dutyMinutes) ? dutyMinutes : '—'} min</span></div>
        <div className="patrol-workspace"><div className="patrol-workspace__map"><PatrolMapSearch onSelect={setFocus} /><PatrolMap blocks={[preview]} type={type} mode={mode} start={patrolTime(start)} focus={focus} onPoint={type === 'route' || draft.coverageType === 'custom' ? selectPoint : undefined} /><p className="patrol-map-caption">{type === 'route' ? 'Select start, intermediate stops and destination in order. Add points at actual road or walkway turns.' : draft.coverageType === 'barangay' ? 'Whole barangay coverage uses the administrative boundary when available.' : 'Search a place or barangay, then tap the exact location to set coverage.'}</p></div>
          <details className="patrol-workspace__config" open><summary><MapPin size={16} />{editing === null ? `New ${type}` : `Edit ${type} ${editing + 1}`} configuration</summary><div className="patrol-workspace__fields">
            <label>{type === 'route' ? 'Route name' : 'Area name'}<input ref={nameRef} maxLength={200} value={draft.label} placeholder={type === 'route' ? 'Centro to public market' : 'Public market'} onChange={e => update({ label: e.target.value })} /></label>
            <div className="patrol-tinted-panel patrol-time-summary"><Clock3 size={17} /><div><strong>{scheduleComplete && editing === null ? 'Duty fully scheduled' : blockTimeLabel(patrolTime(start), draft, draftOffset)}</strong><small>{scheduleComplete && editing === null ? 'Review the schedule or edit a saved block' : 'Computed from the duty and saved blocks'}</small></div></div>
            <PatrolDurationControl key={`${editing ?? 'new'}-${blocks.length}`} value={draft.durationMinutes} remaining={available} onChange={durationMinutes => update({ durationMinutes })} />
            {type === 'area' ? <><fieldset className="patrol-coverage-selector"><legend>Coverage type</legend>{[['barangay', 'Whole Barangay'], ['custom', 'Custom Area']].map(([value, label]) => <label key={value}><input type="radio" name="patrol-coverage" checked={draft.coverageType === value} onChange={() => update({ coverageType: value, latitude: undefined, longitude: undefined, geometry: null, barangay: '' })} />{label}</label>)}</fieldset>
              {draft.coverageType === 'barangay' ? <label>Barangay<select aria-label="Barangay" value={draft.barangay} onChange={e => update({ barangay: e.target.value, label: e.target.value ? `Barangay ${e.target.value}` : '', latitude: undefined, longitude: undefined, geometry: null })}><option value="">Choose barangay</option>{CABAGAN_BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></label>
                : <label>Coverage radius (meters)<input type="number" min={50} max={5000} value={draft.radiusMeters} onChange={e => update({ radiusMeters: Number(e.target.value) })} /></label>}</>
              : <><label>Allowed distance from route (meters, each side)<input type="number" min={50} max={1000} value={draft.routeCorridorMeters ?? 100} onChange={e => update({ routeCorridorMeters: Number(e.target.value) })} /></label><ol className="patrol-route-points">{draft.routePoints.map((point, index) => <li key={index}><span className="patrol-step">{index + 1}</span><label><span className="visually-hidden">Route point {index + 1} label</span><input maxLength={200} value={point.label || ''} placeholder={index === 0 ? 'Start' : `Point ${index + 1}`} onChange={e => update({ routePoints: draft.routePoints.map((p, i) => i === index ? { ...p, label: e.target.value } : p) })} /><small>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</small></label><div className="patrol-route-points__actions"><button type="button" aria-label={`Move route point ${index + 1} up`} disabled={index === 0} onClick={() => update({ routePoints: moveItem(draft.routePoints, index, index - 1) })}><ArrowUp size={13} /></button><button type="button" aria-label={`Move route point ${index + 1} down`} disabled={index === draft.routePoints.length - 1} onClick={() => update({ routePoints: moveItem(draft.routePoints, index, index + 1) })}><ArrowDown size={13} /></button><button type="button" aria-label={`Remove route point ${index + 1}`} onClick={() => update({ routePoints: draft.routePoints.filter((_, i) => i !== index) })}><Trash2 size={13} /></button></div></li>)}</ol></>}
            <label>Transition grace period (minutes)<input type="number" min={0} max={60} value={graceMinutes} onChange={e => setGraceMinutes(Number(e.target.value))} /></label><small>The number of minutes allowed to move to the next area or route before outside-coverage warnings begin. It does not extend the duty or any block.</small>
            {coverage.message && <p role="status" className={`patrol-notice ${coverage.loading ? '' : preview.geometry ? 'is-valid' : 'is-warning'}`}>{coverage.message}</p>}
            {type === 'area' && Number.isFinite(draft.latitude) && <div className="patrol-location-summary"><MapPin size={16} /><span>{draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}<small>{draft.radiusMeters} m radius · Selection saved with this block</small></span></div>}
            {(type === 'route' || draft.coverageType === 'custom') && <details className="patrol-coordinate-entry"><summary>Enter exact coordinates</summary><div className="patrol-two-columns"><label>Latitude<input type="number" step="any" value={coordinates.latitude} onChange={e => setCoordinates(c => ({ ...c, latitude: e.target.value }))} /></label><label>Longitude<input type="number" step="any" value={coordinates.longitude} onChange={e => setCoordinates(c => ({ ...c, longitude: e.target.value }))} /></label></div><button type="button" disabled={!coordinates.latitude || !coordinates.longitude} onClick={() => selectPoint({ latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) })}><MapPin size={14} />Use coordinates</button></details>}
            <div className="patrol-draft-actions"><button type="button" onClick={() => clearDraft()}>Clear current {type === 'route' ? 'route' : 'selection'}</button><button type="button" className="patrol-primary" disabled={coverage.loading || editing === null && (blocks.length >= 48 || scheduleComplete)} onClick={saveBlock}><Check size={16} />Save {type}</button></div>
          </div></details></div>
        <div className="patrol-saved-schedule">{routesLoading && <p role="status" className="patrol-notice">Updating saved routes for the selected travel mode…</p>}<div className="patrol-section-heading"><h4>Saved {type === 'area' ? 'areas' : 'routes'} <span className="patrol-badge">{blocks.length}</span></h4><button type="button" disabled={blocks.length >= 48 || scheduleComplete} onClick={() => { if (editing !== null || draft.label.trim() || draft.routePoints.length || Number.isFinite(draft.latitude)) return setError(`Save the current ${type} or clear its selection before adding another.`); clearDraft(); nameRef.current?.focus() }}><Plus size={16} />Add next {type}</button></div>
          {blocks.length ? <PatrolScheduleTimeline blocks={blocks} start={patrolTime(start)} type={type} mode={mode} expanded={expanded} onExpand={setExpanded} onEdit={editBlock} onDelete={deleteBlock} onMove={reorderBlock} /> : <div className="patrol-empty"><MapPin size={22} /><strong>Your schedule starts here</strong><p>Configure the first {type} on the map, then select Save {type}.</p></div>}
          {minutes > dutyMinutes && <p className="patrol-notice is-warning">The schedule exceeds the duty by {minutes - dutyMinutes} minutes. Edit a duration before reviewing.</p>}
        </div>
      </section>
      <section className="patrol-panel"><div className="patrol-section-heading"><span className="patrol-step is-teal">03</span><div><h4>{vehicleMode ? 'Vehicle & weekly crew' : 'Assign personnel'}</h4><p>{vehicleMode ? 'Select a vehicle to load its locked crew automatically.' : 'Choose the officers assigned to this complete duty.'}</p></div>{vehicleMode ? <Car size={20} /> : <Users size={20} />}</div>
        {vehicleMode ? <><div className="patrol-section-heading"><label className="patrol-vehicle-select">Vehicle<select aria-label="Vehicle" value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Choose assigned vehicle</option>{fleet.vehicles.filter(v => v.mode === mode).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><button type="button" onClick={() => setCrewOpen(true)} disabled={fleetLoading || Boolean(fleetError)}><Car size={16} />Manage weekly vehicle crews</button></div>
          <p>Week starting {weekStart || '—'} · Monday–Sunday</p>{fleetLoading && <p role="status">Loading vehicle crews…</p>}{fleetError && <p role="alert" className="patrol-notice is-error">Vehicle assignments unavailable. <button type="button" onClick={() => { void loadFleet().catch(() => {}) }}>Retry</button></p>}
          {crew ? <div className="patrol-tinted-panel"><span className="patrol-badge is-valid"><LockKeyhole size={14} />Locked weekly crew</span><ul className="patrol-crew-summary">{crew.personnelIds.map(id => <li key={id}><strong>{personnel.find(p => p.id === id)?.name || id}</strong><span>{crew.driverId === id ? 'Driver' : 'Crew'}</span></li>)}</ul></div> : !fleetLoading && vehicleId && <div className="patrol-notice is-warning">This vehicle has no locked weekly crew. <button type="button" onClick={() => setCrewOpen(true)}>Set up weekly crew</button></div>}</>
          : <PatrolPersonnelSelect personnel={personnel} ids={ids} onChange={setIds} />}
      </section>
      <section className="patrol-panel"><div className="patrol-section-heading"><span className="patrol-step">04</span><div><h4>Deployment instructions</h4><p>Brief the team before they begin their duty.</p></div></div><label><span className="visually-hidden">Instructions</span><textarea maxLength={1000} rows={3} placeholder="Priorities, checkpoints and instructions for the assigned team…" value={notes} onChange={e => setNotes(e.target.value)} /></label><small>{notes.length} / 1,000 characters</small></section>
      {error && <p role="alert" className="patrol-notice is-error">{error}</p>}
      <footer className="patrol-planner__footer"><span><ShieldCheck size={17} />Review all coverage and duty hours before deploying.</span><div>{initial && <button type="button" disabled={saving} onClick={onCancel}>Cancel changes</button>}<button className="patrol-primary" type="submit" disabled={saving || !ready || vehicleMode && !crew}><ClipboardCheck size={17} />Review patrol schedule</button></div></footer>
    </form>
    {crewOpen && <WeeklyVehicleAssignments fleet={fleet} personnel={personnel} initialWeek={weekStart} initialVehicle={vehicleId} onSaved={loadFleet} onClose={() => setCrewOpen(false)} />}
    {review && <PatrolScheduleDialog assignment={reviewGroup[0]} group={reviewGroup} saving={saving} onClose={() => { if (!saving) setReview(false) }} onConfirm={save} onEdit={editBlock} onDelete={deleteBlock} onMove={reorderBlock} />}
    <ConfirmModal open={Boolean(switchType)} title="Change patrol style?" message="Changing patrol style clears the current areas or routes. Your personnel, instructions and duty hours will be kept." confirmLabel="Change style" cancelLabel="Keep current style" onConfirm={() => changeType(switchType)} onCancel={() => setSwitchType(null)} />
  </section>
}
