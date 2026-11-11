import { useEffect, useState } from 'react'
import { MapPin, Route, ShieldCheck, Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'
import { patrolBarangayReferences } from './patrolReferenceCenters'
import { createDeploymentId } from './deploymentForm'
import DeploymentPointModal from './DeploymentPointModal'
import WeeklyVehicleAssignments from './WeeklyVehicleAssignments'
import { weekFor, toPatrolLocalTime, patrolTime } from './patrolPlannerTime'
import '../../styles/patrol-planner.css'

const emptyBlock = () => ({ label: '', coverageType: 'custom', durationMinutes: 120, radiusMeters: 200, routeCorridorMeters: 100, routePoints: [], barangay: '' })
const displayTime = value => new Date(value).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })

export default function PatrolPlanner({ personnel, assignments, initialGroup = [], saving, ready, onSave, onCancel }) {
  const initial = initialGroup[0]
  const [type, setType] = useState(initial?.deploymentType || 'area')
  const [mode, setMode] = useState(initial?.patrolMode || 'walk')
  const [start, setStart] = useState(() => toPatrolLocalTime(initial?.shiftStart || new Date()))
  const [end, setEnd] = useState(() => toPatrolLocalTime(initial?.shiftEnd || new Date(Date.now() + 8 * 3600000)))
  const [blocks, setBlocks] = useState(initial?.scheduleBlocks?.length ? initial.scheduleBlocks : [emptyBlock()])
  const [ids, setIds] = useState(initialGroup.map(a => a.personnelId))
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [graceMinutes, setGraceMinutes] = useState(initial?.transitionGraceMinutes ?? 10)
  const [search, setSearch] = useState('')
  const [mapIndex, setMapIndex] = useState(null)
  const [fleet, setFleet] = useState({ vehicles: [], weeks: [] })
  const [fleetError, setFleetError] = useState('')
  const [error, setError] = useState('')
  const loadFleet = async () => {
    try { setFleet(await apiRequest('/api/patrol/fleet')); setFleetError('') }
    catch (e) { setFleetError(e.message) }
  }
  useEffect(() => {
    let active = true
    apiRequest('/api/patrol/fleet').then(data => { if (active) setFleet(data) })
      .catch(e => { if (active) setFleetError(e.message) })
    return () => { active = false }
  }, [])
  const vehicleMode = type === 'route' && ['car', 'motorcycle'].includes(mode)
  const week = fleet.weeks.find(w => w.weekStart === weekFor(patrolTime(start)))
  const crew = vehicleMode ? week?.crews.find(c => c.vehicleId === vehicleId) : null
  const selectedIds = vehicleMode ? crew?.personnelIds || [] : ids
  const updateBlock = (index, patch) => setBlocks(current => current.map((b, i) => i === index ? { ...b, ...patch } : b))
  const minutes = blocks.reduce((total, b) => total + Number(b.durationMinutes), 0)
  const dutyMinutes = Math.round((patrolTime(end) - patrolTime(start)) / 60000)
  const offset = index => blocks.slice(0, index).reduce((total, b) => total + Number(b.durationMinutes), 0)
  const save = async event => {
    event.preventDefault(); setError('')
    if (!ready) return setError('Wait for deployments to load before saving.')
    if (!selectedIds.length) return setError('Select personnel or save this week’s vehicle crew first.')
    if (!Number.isFinite(dutyMinutes) || dutyMinutes <= 0 || dutyMinutes > 1440 || minutes !== dutyMinutes) return setError('Schedule durations must fill the full duty exactly (maximum 24 hours).')
    if (blocks.some(b => !b.label.trim() || (type === 'route' ? b.routePoints.length < 2
      : b.coverageType === 'barangay' ? !b.barangay : !Number.isFinite(b.latitude)))) return setError('Name every block and select its barangay, map coverage or route points.')
    const groupId = initial?.groupId || createDeploymentId('GRP')
    const next = selectedIds.map(id => {
      const prior = initialGroup.find(a => a.personnelId === id)
      return { id: prior?.id || createDeploymentId('DEP'), groupId, personnelId: id,
        deploymentType: type, patrolMode: type === 'route' ? mode : '', vehicleId: vehicleMode ? vehicleId : '',
        scheduleBlocks: blocks.map((b, i) => ({ ...b, offsetMinutes: offset(i), durationMinutes: Number(b.durationMinutes) })),
        patrolArea: blocks[0].label, patrolAreaId: 'scheduled-patrol', notes,
        transitionGraceMinutes: graceMinutes,
        shiftStart: patrolTime(start).toISOString(), shiftEnd: patrolTime(end).toISOString(),
        status: patrolTime(start).getTime() > Date.now() ? 'scheduled' : 'active' }
    })
    if (await onSave([...assignments.filter(a => !initialGroup.some(old => old.id === a.id)), ...next], 'Patrol deployment saved.')) onCancel()
  }
  const selectedBlock = mapIndex === null ? null : blocks[mapIndex]
  const selectedArea = patrolBarangayReferences.find(a => a.name === `Barangay ${selectedBlock?.barangay}`) || patrolBarangayReferences.find(a => a.name === 'Barangay Centro')
  return <section className="patrol-planner widget-card">
    <header><h3>Plan a patrol duty</h3><p>Choose the patrol style, set the duty hours, then schedule where the personnel will patrol.</p></header>
    {fleetError && <p role="alert">Vehicle assignments unavailable. <button type="button" onClick={loadFleet}>Retry</button></p>}
    <WeeklyVehicleAssignments fleet={fleet} personnel={personnel} onSaved={loadFleet} />
    <form onSubmit={save}>
      <fieldset className="patrol-planner__styles"><legend>Deployment style</legend>
        {[['area', 'Area Patrol', 'Patrol or guard an assigned coverage area'], ['route', 'Route Patrol', 'Follow an assigned path or sequence of places']].map(([value, label, hint]) =>
          <button type="button" key={value} aria-label={label} aria-pressed={type === value} className={type === value ? 'is-active' : ''}
            onClick={() => { if (type !== value) { setType(value); setBlocks([emptyBlock()]) } }}>{value === 'area' ? <ShieldCheck size={22} /> : <Route size={22} />}<span><strong>{label}</strong><small>{hint}</small></span></button>)}
      </fieldset>
      {type === 'route' && <fieldset className="patrol-planner__modes"><legend>Travel mode</legend>{[['walk', 'Foot Patrol'], ['motorcycle', 'Motorcycle Patrol'], ['car', 'Car Patrol']].map(([value, label]) =>
        <label key={value}><input type="radio" name="travelMode" checked={mode === value} onChange={() => { setMode(value); setVehicleId('') }} />{label}</label>)}</fieldset>}
      <fieldset className="patrol-planner__timing"><legend>Duty hours</legend>
        <label>Start<input required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>End<input required type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <small>One duty, with consecutive blocks. All times are Philippine time (UTC+8).</small>
        <label>Travel allowance (minutes)<input type="number" min={0} max={60} value={graceMinutes} onChange={e => setGraceMinutes(Number(e.target.value))} /></label>
        <small>Outside-coverage warnings wait this long after a move to the next area. This does not extend the duty or the schedule blocks.</small>
      </fieldset>
      <fieldset><legend>{type === 'area' ? 'Area' : 'Route'} schedule</legend>
        <p>Each new block defaults to 2 hours. Adjust the last block to fill the duty, or use one block for a full-duty assignment.</p>
        <ol className="patrol-planner__blocks">{blocks.map((block, index) => <li key={index}>
          <div className="patrol-planner__block-heading"><strong>{start && Number.isFinite(patrolTime(start).getTime()) ? `${displayTime(+patrolTime(start) + offset(index) * 60000)} – ${displayTime(+patrolTime(start) + (offset(index) + Number(block.durationMinutes)) * 60000)}` : 'Schedule block'}</strong>
            {blocks.length > 1 && <button type="button" aria-label={`Remove block ${index + 1}`} onClick={() => setBlocks(b => b.filter((_, i) => i !== index))}><Trash2 size={18} /></button>}</div>
          <div className="patrol-planner__block-fields">
            <label>{type === 'route' ? 'Route name' : 'Area name'}<input required maxLength={200} value={block.label} placeholder={type === 'route' ? 'Ngarag → Cansan → Magassi' : 'Public market'} onChange={e => updateBlock(index, { label: e.target.value })} /></label>
            <label>Duration (minutes)<input required type="number" min={15} max={1440} step={1} value={block.durationMinutes} onChange={e => updateBlock(index, { durationMinutes: Number(e.target.value) })} /></label>
          </div>
          {type === 'route' && <>
            <label>Allowed distance from route (meters, each side)<input type="number" min={50} max={1000} value={block.routeCorridorMeters ?? 100} onChange={e => updateBlock(index, { routeCorridorMeters: Number(e.target.value) })} /></label>
            <small>{mode === 'walk' ? 'Place points along the actual walking path, including its turns. Warnings follow that saved path.' : 'Warnings follow the saved road route. If road directions are unavailable, route warnings stay off until the route is saved with available directions.'} GPS tolerance and the travel allowance also apply.</small>
          </>}
          {type === 'area' && <><div className="patrol-planner__modes">{[['barangay', 'Whole Barangay'], ['custom', 'Custom Area']].map(([value, label]) => <label key={value}><input type="radio" name={`coverage-${index}`} checked={block.coverageType === value} onChange={() => updateBlock(index, { coverageType: value, latitude: undefined, longitude: undefined, geometry: undefined, boundarySource: undefined })} />{label}</label>)}</div>
            {block.coverageType === 'barangay' ? <label>Barangay<select required value={block.barangay} onChange={e => updateBlock(index, { barangay: e.target.value, label: `Barangay ${e.target.value}`, geometry: undefined, boundarySource: undefined, latitude: undefined, longitude: undefined })}><option value="">Choose barangay</option>{CABAGAN_BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></label>
              : <label>Coverage radius (meters)<input type="number" min={50} max={5000} value={block.radiusMeters} onChange={e => updateBlock(index, { radiusMeters: Number(e.target.value) })} /></label>}</>}
          {(type === 'route' || block.coverageType === 'custom') && <>
            <button type="button" onClick={() => setMapIndex(index)}><MapPin size={17} /> {type === 'route' ? 'Add route point on map' : 'Set coverage on map'}</button>
            {type === 'route' ? <ol className="patrol-planner__route-points">{block.routePoints.map((p, i) => <li key={i}>{p.label || 'Route point'} · {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} <button type="button" aria-label={`Remove route point ${i + 1}`} onClick={() => updateBlock(index, { routePoints: block.routePoints.filter((_, j) => i !== j) })}>Remove</button></li>)}</ol>
              : Number.isFinite(block.latitude) && <small>{block.latitude.toFixed(6)}, {block.longitude.toFixed(6)} · {block.radiusMeters} m radius</small>}
          </>}
          {type === 'area' && block.coverageType === 'barangay' && <>
            <button type="button" disabled={!block.barangay} onClick={() => setMapIndex(index)}><MapPin size={17} />View barangay coverage</button>
            <small>Barangay outlines require boundary data. If unavailable, the map shows a reference location and outside-coverage alerts stay off for this block.</small>
          </>}
        </li>)}</ol>
        <div className="patrol-planner__block-heading"><button type="button" onClick={() => setBlocks(b => [...b, emptyBlock()])} disabled={blocks.length >= 48}><Plus size={17} />Add next {type === 'area' ? 'area' : 'route'}</button>
          <span role="status">{minutes} / {Number.isFinite(dutyMinutes) ? dutyMinutes : '—'} minutes scheduled</span></div>
      </fieldset>
      <fieldset><legend>Personnel{vehicleMode ? ' and vehicle' : ''}</legend>
        {vehicleMode ? <><label>Vehicle<select required value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Choose assigned vehicle</option>{fleet.vehicles.filter(v => v.mode === mode).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <p>Week of {weekFor(patrolTime(start))} · {crew ? 'Locked crew' : 'No weekly crew saved for this vehicle'}</p>
          {crew && <ul>{crew.personnelIds.map(id => <li key={id}>{personnel.find(p => p.id === id)?.name || id}{crew.driverId === id ? ' · Driver' : ''}</li>)}</ul>}</>
          : <><label>Find personnel<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or badge" /></label><div className="patrol-planner__crew-list">{personnel.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase())).map(p => <label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={e => setIds(old => e.target.checked ? [...old, p.id] : old.filter(id => id !== p.id))} />{p.name}</label>)}</div></>}
      </fieldset>
      <label>Instructions<textarea maxLength={1000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {error && <p role="alert" className="patrol-planner__error">{error}</p>}
      <footer><button className="report-generate-btn" type="submit" disabled={saving || !ready}>{saving ? 'Saving…' : initial ? 'Save patrol changes' : 'Save deployment'}</button>{initial && <button type="button" onClick={onCancel}>Cancel changes</button>}</footer>
    </form>
    {selectedBlock && <DeploymentPointModal area={selectedArea} visible onClose={() => setMapIndex(null)}
      readOnly={type === 'area' && selectedBlock.coverageType === 'barangay'} barangay={selectedBlock.barangay} savedGeometry={selectedBlock.geometry}
      radiusMeters={type === 'area' && selectedBlock.coverageType === 'custom' ? selectedBlock.radiusMeters : undefined} routePoints={type === 'route' ? selectedBlock.routePoints : undefined}
      initialPoint={Number.isFinite(selectedBlock.latitude) ? { ...selectedBlock, label: selectedBlock.label } : null}
      onConfirm={point => { updateBlock(mapIndex, type === 'route' ? { routePoints: [...selectedBlock.routePoints, point] } : { ...point, label: selectedBlock.label || point.label }); setMapIndex(null) }} />}
  </section>
}
