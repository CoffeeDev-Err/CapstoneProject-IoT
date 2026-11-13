import { createElement, useEffect, useRef, useState } from 'react'
import { Car, Check, ClipboardCheck, Footprints, LockKeyhole, Route, ShieldCheck, Users } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { createDeploymentId } from './deploymentForm'
import ConfirmModal from '../../components/ConfirmModal'
import WeeklyVehicleAssignments from './WeeklyVehicleAssignments'
import PatrolAreaScheduleBuilder from './PatrolAreaScheduleBuilder'
import PatrolRouteScheduleBuilder from './PatrolRouteScheduleBuilder'
import PatrolPersonnelSelect from './PatrolPersonnelSelect'
import PatrolScheduleDialog from './PatrolScheduleDialog'
import { blockOffset, hasBlockCoverage } from './patrolScheduleView'
import { weekFor, toPatrolLocalTime, patrolTime } from './patrolPlannerTime'
import '../../styles/patrol-planner.css'

export default function PatrolPlanner({ personnel, assignments, initialGroup = [], saving, ready, onSave, onCancel, embedded = false }) {
  const initial = initialGroup[0]
  const [groupId] = useState(() => initial?.groupId || createDeploymentId('GRP'))
  const [recordPrefix] = useState(() => createDeploymentId('DEP'))
  const [type, setType] = useState(initial?.deploymentType || 'area')
  const [mode, setMode] = useState(initial?.patrolMode || 'walk')
  const [areaTravelMode, setAreaTravelMode] = useState(initial?.areaTravelMode || 'walk')
  const [start, setStart] = useState(() => toPatrolLocalTime(initial?.shiftStart || new Date()))
  const [end, setEnd] = useState(() => toPatrolLocalTime(initial?.shiftEnd || new Date(Date.now() + 8 * 3600000)))
  const [blocks, setBlocks] = useState(initial?.scheduleBlocks || [])
  const [scheduleDirty, setScheduleDirty] = useState(false)
  const builder = useRef(null)
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
  const endRef = useRef(null)
  const errorRef = useRef(null)
  const savingRef = useRef(false)
  const loadFleet = async () => {
    try { setFleet(await apiRequest('/api/patrol/fleet')); setFleetError('') }
    catch (e) { setFleetError(e.message); throw e }
  }
  useEffect(() => {
    let active = true
    apiRequest('/api/patrol/fleet').then(data => { if (active) { setFleet(data); setFleetError('') } })
      .catch(e => { if (active) setFleetError(e.message) }).finally(() => { if (active) setFleetLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => { if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView?.({ block: 'center' }) } }, [error])
  const vehicleMode = type === 'route' && ['car', 'motorcycle'].includes(mode)
  const weekStart = weekFor(patrolTime(start))
  const week = fleet.weeks.find(w => w.weekStart === weekStart)
  const crew = vehicleMode ? week?.crews.find(c => c.vehicleId === vehicleId) : null
  const selectedIds = vehicleMode ? crew?.personnelIds || [] : ids
  const minutes = blocks.reduce((sum, block) => sum + Number(block.durationMinutes), 0)
  const dutyMinutes = Math.round((patrolTime(end) - patrolTime(start)) / 60000)
  const dutyError = !Number.isFinite(dutyMinutes) ? 'Choose both duty start and end dates.' : dutyMinutes <= 0 ? 'Duty end must be after the start.' : dutyMinutes > 1440 ? `This duty is ${dutyMinutes / 60} hours. The maximum is 24 hours; adjust the start or end.` : ''
  const changeType = value => { setType(value); setBlocks([]); setScheduleDirty(false); setSwitchType(null); setError('') }
  const validate = () => {
    if (!ready) return 'Wait for deployments to load before saving.'
    if (scheduleDirty) return `Save all selected ${type === 'area' ? 'areas' : 'routes'} before reviewing the patrol schedule.`
    if (dutyError || minutes !== dutyMinutes) return 'Schedule durations must fill the full duty exactly (maximum 24 hours).'
    if (!blocks.length || blocks.some(block => !hasBlockCoverage(block, type))) return 'Save at least one configured schedule block.'
    if (vehicleMode && (!crew || fleetLoading || fleetError)) return 'Set up the locked weekly crew for this vehicle before deployment.'
    if (vehicleMode && weekFor(new Date(+patrolTime(end) - 1)) !== weekStart) return 'Keep the complete vehicle duty within its locked Monday–Sunday crew assignment.'
    if (!selectedIds.length) return 'Select personnel or save this week’s vehicle crew first.'
    if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 60) return 'Transition grace period must be 0 to 60 minutes.'
    return ''
  }
  const buildAssignments = () => selectedIds.map(id => {
    const prior = initialGroup.find(a => a.personnelId === id)
    const member = personnel.find(p => p.id === id)
    return { id: prior?.id || `${recordPrefix}-${id}`, groupId, personnelId: id, personnelName: member?.name || prior?.personnelName || id, rank: member?.rank || prior?.rank || '',
      deploymentType: type, patrolMode: type === 'route' ? mode : '', ...(type === 'area' ? { areaTravelMode } : {}), vehicleId: vehicleMode ? vehicleId : '', vehicleCrew: vehicleMode ? crew : undefined,
      scheduleBlocks: blocks.map((block, i) => ({ ...block, offsetMinutes: blockOffset(blocks, i), durationMinutes: Number(block.durationMinutes) })),
      patrolArea: blocks[0]?.label || '', patrolAreaId: 'scheduled-patrol', notes, transitionGraceMinutes: graceMinutes,
      shiftStart: patrolTime(start).toISOString(), shiftEnd: patrolTime(end).toISOString(), status: +patrolTime(start) > Date.now() ? 'scheduled' : 'active' }
  })
  const save = async () => {
    if (savingRef.current) return
    const message = validate()
    if (message) { setReview(false); setError(message); return }
    savingRef.current = true
    try {
      const next = buildAssignments()
      if (await onSave([...assignments.filter(a => !initialGroup.some(old => old.id === a.id)), ...next], initial ? 'Patrol deployment updated. Affected personnel have been notified.' : 'Patrol deployment saved.')) {
        setBlocks([]); builder.current?.reset(); setIds([]); setVehicleId(''); setNotes(''); setReview(false); onCancel({ deploymentId: next[0].id })
      }
    } finally { savingRef.current = false }
  }
  const reviewGroup = review ? buildAssignments() : []
  const scheduleProps = { ref: builder, initialBlocks: blocks, start: patrolTime(start), dutyMinutes, dutyError, graceMinutes, onGraceChange: setGraceMinutes, onDirtyChange: setScheduleDirty, onCommit: next => { setBlocks(next); setScheduleDirty(false); setError('') } }
  return <section className="patrol-planner patrol-theme">
    {!embedded && <header className="patrol-planner__header"><div><span className="patrol-eyebrow"><ShieldCheck size={16} /> Patrol operations</span><h3>{initial ? 'Reassign patrol deployment' : 'Plan a patrol duty'}</h3><p>Set the duty. Build the schedule on the map. Deploy your team.</p></div></header>}
    <form onSubmit={event => { event.preventDefault(); if (dutyError) { endRef.current?.focus(); return }; const message = validate(); setError(message); if (!message) setReview(true) }}>
      <section className="patrol-panel"><div className="patrol-section-heading"><span className="patrol-step">01</span><div><h4>Patrol style & duty</h4><p>One duty, with consecutive area or route blocks.</p></div><span className="patrol-badge">Philippine time · UTC+8</span></div>
        <fieldset className="patrol-style-selector"><legend className="visually-hidden">Deployment style</legend>{[['area', 'Area Patrol', 'Cover a barangay or a custom area', ShieldCheck], ['route', 'Route Patrol', 'Follow a road or walking path', Route]].map(([value, label, hint, icon]) => <button type="button" key={value} aria-label={label} aria-pressed={type === value} className={type === value ? 'is-active' : ''} onClick={() => { if (type !== value) { if (scheduleDirty || blocks.length) setSwitchType(value); else changeType(value) } }}>{createElement(icon, { size: 23 })}<span><strong>{label}</strong><small>{hint}</small></span>{type === value && <Check size={17} />}</button>)}</fieldset>
        {type === 'route' && <fieldset className="patrol-mode-selector"><legend>Travel mode</legend>{[['walk', 'Foot Patrol', Footprints], ['motorcycle', 'Motorcycle Patrol', Route], ['car', 'Car Patrol', Car]].map(([value, label, icon]) => <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? 'is-active' : ''} onClick={() => { if (mode !== value) { setMode(value); setVehicleId(''); setError('') } }}>{createElement(icon, { size: 16 })}{label}</button>)}</fieldset>}
        <div className="patrol-two-columns patrol-duty"><label>Start<input required type="datetime-local" value={start} onChange={e => { setStart(e.target.value); setError('') }} /></label><label>End<input ref={endRef} required type="datetime-local" aria-invalid={Boolean(dutyError)} value={end} onChange={e => { setEnd(e.target.value); setError('') }} /></label></div>
        <p role={dutyError ? 'alert' : undefined} className={dutyError ? 'patrol-notice is-error' : undefined}>{dutyError || 'One duty can last up to 24 hours. Saved block durations must fill it exactly.'}</p>
      </section>
      <section className="patrol-panel patrol-schedule-panel"><div className="patrol-section-heading"><span className="patrol-step is-gold">02</span><div><h4>Build the {type} schedule</h4><p>Two hours per block by default. Use one full-duty block for a fixed assignment.</p></div></div>
        {type === 'area' ? <PatrolAreaScheduleBuilder {...scheduleProps} travelMode={areaTravelMode} onTravelModeChange={setAreaTravelMode} /> : <PatrolRouteScheduleBuilder {...scheduleProps} mode={mode} />}
      </section>
      <div className="patrol-team-instructions"><section className="patrol-panel patrol-team-panel"><div className="patrol-section-heading"><span className="patrol-step is-teal">03</span><div><h4>{vehicleMode ? 'Vehicle & weekly crew' : 'Assign personnel'}</h4><p>{vehicleMode ? 'Select a vehicle to load its locked crew automatically.' : 'Choose the officers assigned to this complete duty.'}</p></div>{vehicleMode ? <Car size={20} /> : <Users size={20} />}</div>
        {vehicleMode ? <><div className="patrol-vehicle-controls"><label className="patrol-vehicle-select">Vehicle<select aria-label="Vehicle" value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Choose assigned vehicle</option>{fleet.vehicles.filter(v => v.mode === mode).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><button type="button" onClick={() => setCrewOpen(true)} disabled={fleetLoading || Boolean(fleetError)}><Car size={16} />Manage weekly vehicle crews</button></div>
          <p>Week starting {weekStart || '—'} · Monday–Sunday</p>{fleetLoading && <p role="status">Loading vehicle crews…</p>}{fleetError && <p role="alert" className="patrol-notice is-error">Vehicle assignments unavailable. <button type="button" onClick={() => { void loadFleet().catch(() => {}) }}>Retry</button></p>}
          {crew ? <div className="patrol-tinted-panel"><span className="patrol-badge is-valid"><LockKeyhole size={14} />Locked weekly crew</span><ul className="patrol-crew-summary">{crew.personnelIds.map(id => <li key={id}><strong>{personnel.find(p => p.id === id)?.name || id}</strong><span>{crew.driverId === id ? 'Driver' : 'Crew'}</span></li>)}</ul></div> : !fleetLoading && vehicleId && <div className="patrol-notice is-warning patrol-crew-warning"><span>This vehicle has no locked weekly crew.</span><button type="button" onClick={() => setCrewOpen(true)}>Set up weekly crew</button></div>}</>
          : <PatrolPersonnelSelect personnel={personnel} ids={ids} onChange={setIds} />}
      </section><section className="patrol-panel patrol-instructions-panel"><div className="patrol-section-heading"><span className="patrol-step">04</span><div><h4>Deployment instructions</h4><p>Brief the team before they begin their duty.</p></div></div><label><span className="visually-hidden">Instructions</span><textarea maxLength={1000} rows={5} placeholder="Priorities, checkpoints and instructions for the assigned team…" value={notes} onChange={e => setNotes(e.target.value)} /></label><small>{notes.length} / 1,000 characters</small></section></div>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="patrol-notice is-error">{error}</p>}
      <footer className="patrol-planner__footer"><span><ShieldCheck size={17} />Review all coverage and duty hours before deploying.</span><div>{initial && <button type="button" disabled={saving} onClick={() => onCancel()}>Cancel changes</button>}<button className="patrol-primary" type="submit" disabled={saving || !ready || vehicleMode && !crew}><ClipboardCheck size={17} />Review patrol schedule</button></div></footer>
    </form>
    {crewOpen && <WeeklyVehicleAssignments fleet={fleet} personnel={personnel} initialWeek={weekStart} initialVehicle={vehicleId} onSaved={loadFleet} onClose={() => setCrewOpen(false)} />}
    {review && <PatrolScheduleDialog assignment={reviewGroup[0]} group={reviewGroup} saving={saving} onClose={() => { if (!saving) setReview(false) }} onConfirm={save} onEdit={index => { setReview(false); builder.current?.edit(index) }} onDelete={index => { setReview(false); builder.current?.remove(index) }} onMove={(from, to) => { setReview(false); builder.current?.move(from, to) }} />}
    <ConfirmModal open={Boolean(switchType)} title="Change patrol style?" message="Changing patrol style clears the current areas or routes. Your personnel, instructions and duty hours will be kept." confirmLabel="Change style" cancelLabel="Keep current style" onConfirm={() => changeType(switchType)} onCancel={() => setSwitchType(null)} />
  </section>
}
