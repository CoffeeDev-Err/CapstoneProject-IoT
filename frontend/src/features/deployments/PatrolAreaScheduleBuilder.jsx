import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Check, MapPin } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'
import { isInsideCabagan } from '../../utils/cabaganGeofence'
import PatrolMap from './PatrolMap'
import PatrolMapSearch from './PatrolMapSearch'
import PatrolDurationControl from './PatrolDurationControl'
import PatrolScheduleTimeline from './PatrolScheduleTimeline'
import { patrolBarangayReferences } from './patrolReferenceCenters'
import { blockOffset, blockTimeLabel, emptyPatrolBlock, hasBlockCoverage, moveItem } from './patrolScheduleView'

const renumber = areas => areas.map((area, index) => area.autoLabel ? { ...area, label: `Area ${index + 1}` } : area)

export default function PatrolAreaScheduleBuilder({ ref, initialBlocks, start, dutyMinutes, dutyError, graceMinutes, onGraceChange, onDirtyChange, onCommit }) {
  const [areas, setAreas] = useState(() => initialBlocks.map(area => ({ ...area })))
  const [saved, setSaved] = useState(() => JSON.stringify(initialBlocks))
  const [active, setActive] = useState(initialBlocks.length ? 0 : null)
  const [template, setTemplate] = useState(emptyPatrolBlock)
  const [expanded, setExpanded] = useState(null)
  const [focus, setFocus] = useState(() => initialBlocks[0] || null)
  const [replacing, setReplacing] = useState(false)
  const [message, setMessage] = useState('')
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' })
  const [boundaries, setBoundaries] = useState({ status: 'idle', features: [] })
  const boundaryNeeded = areas.some(a => a.coverageType === 'barangay')
  const dirty = JSON.stringify(areas) !== saved
  const configRef = useRef(null)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!boundaryNeeded) return
    let live = true
    apiRequest('/api/patrol/boundaries').then(data => { if (live) setBoundaries({ status: 'ready', features: data.features || [], attribution: data.attribution }) })
      .catch(() => { if (live) setBoundaries({ status: 'ready', features: [] }) })
    return () => { live = false }
  }, [boundaryNeeded])
  const resolved = areas.map(area => {
    if (area.coverageType !== 'barangay') return area
    const reference = patrolBarangayReferences.find(a => a.name === `Barangay ${area.barangay}`)?.referenceCenter || {}
    const geometry = boundaries.features.find(f => f.properties?.barangay === area.barangay)?.geometry || area.geometry || null
    return { ...area, ...reference, geometry, boundarySource: boundaries.attribution || area.boundarySource }
  })
  const selected = areas[active] || template
  const total = areas.reduce((sum, area) => sum + Number(area.durationMinutes), 0)
  const remaining = dutyMinutes - total
  const invalidIndex = resolved.findIndex(area => !hasBlockCoverage(area, 'area') || !Number.isInteger(area.durationMinutes) || area.durationMinutes < 15 || area.durationMinutes > 1440 || area.coverageType === 'custom' && (!Number.isFinite(area.radiusMeters) || area.radiusMeters < 50 || area.radiusMeters > 5000))
  const incomplete = dutyError ? 'Correct the duty hours above before saving areas.'
    : boundaryNeeded && boundaries.status !== 'ready' ? 'Loading barangay coverage…'
      : !areas.length ? 'Select your first area on the map or choose a barangay.'
        : invalidIndex >= 0 ? `Complete the name, coverage and duration for area ${invalidIndex + 1}. Custom radius must be 50–5,000 meters.`
          : remaining > 0 ? `Select more areas or adjust durations to cover the remaining ${remaining} minutes.`
            : remaining < 0 ? `Shorten the selected durations by ${-remaining} minutes to fit this duty.` : ''
  const selectArea = index => {
    setActive(index); setExpanded(index); setReplacing(false); setMessage(''); setCoordinates({ latitude: '', longitude: '' })
    const area = resolved[index]
    if (Number.isFinite(area?.latitude) && Number.isFinite(area?.longitude)) setFocus({ latitude: area.latitude, longitude: area.longitude })
    if (configRef.current) { configRef.current.open = true; configRef.current.scrollTop = 0 }
  }
  const remove = index => {
    setAreas(current => renumber(current.filter((_, i) => i !== index)))
    setActive(current => current === null ? null : current === index ? null : current > index ? current - 1 : current)
    setExpanded(null); setReplacing(false); setMessage(''); setCoordinates({ latitude: '', longitude: '' })
  }
  const move = (from, to) => { setAreas(current => renumber(moveItem(current, from, to))); setActive(to); setExpanded(to); setReplacing(false) }
  useImperativeHandle(ref, () => ({ edit: selectArea, remove, move, reset: () => { setAreas([]); setSaved('[]'); setActive(null); setTemplate(emptyPatrolBlock()); setMessage('') } }))
  const update = patch => {
    setMessage('')
    if (active === null) setTemplate(current => ({ ...current, ...patch }))
    else setAreas(current => current.map((area, i) => i === active ? { ...area, ...patch } : area))
  }
  const add = patch => {
    if (dutyError) return setMessage('Correct the duty hours above before selecting areas.')
    if (remaining < 15 || areas.length >= 48) return setMessage('Duty hours are fully selected. Choose an area number to edit, remove an area or adjust its duration.')
    const durationMinutes = Math.min(template.durationMinutes, remaining)
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15) return setMessage('Choose an area duration of at least 15 minutes.')
    const next = { ...template, label: areas.length ? `Area ${areas.length + 1}` : template.label.trim() || 'Area 1', autoLabel: areas.length > 0 || !template.label.trim(), durationMinutes, ...patch }
    setAreas(current => [...current, next]); setActive(areas.length); setExpanded(null); setReplacing(false); setMessage(''); setCoordinates({ latitude: '', longitude: '' })
  }
  const selectPoint = point => {
    if (!isInsideCabagan(point.latitude, point.longitude)) return setMessage('Choose a location inside the Cabagan boundary.')
    if (replacing && active !== null) { update({ ...point, coverageType: 'custom', barangay: '', geometry: null }); setReplacing(false) }
    else add({ ...point, coverageType: 'custom', barangay: '', geometry: null })
  }
  const saveAreas = () => {
    if (incomplete) return
    const committed = resolved.map((area, index) => { const block = { ...area, label: area.label.trim(), offsetMinutes: blockOffset(areas, index) }; delete block.autoLabel; return block })
    onCommit(committed); setSaved(JSON.stringify(areas)); setMessage('All selected areas saved to this duty schedule. Continue to personnel and final review.')
  }
  return <>
    <div className="patrol-area-progress" role="status"><strong>{areas.length} {areas.length === 1 ? 'area' : 'areas'} selected · {total} / {Number.isFinite(dutyMinutes) ? dutyMinutes : '—'} minutes covered</strong><span className={`patrol-badge ${dirty ? 'is-warning' : 'is-valid'}`}>{dirty || !areas.length ? 'Selection in progress' : 'Areas saved'}</span></div>
    <div className="patrol-workspace"><div className="patrol-workspace__map">
      <PatrolMapSearch onSelect={setFocus} />
      <div className="patrol-add-barangay"><label>Add whole barangay<select aria-label="Add whole barangay" value="" onChange={e => { if (e.target.value) add({ coverageType: 'barangay', barangay: e.target.value, label: `Barangay ${e.target.value}`, autoLabel: false, latitude: undefined, longitude: undefined, geometry: null }) }}><option value="">Choose a barangay to add</option>{CABAGAN_BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></label></div>
      <PatrolMap blocks={resolved.map((area, index) => ({ ...area, offsetMinutes: blockOffset(areas, index) }))} type="area" start={start} focus={focus} selectedIndex={active} autoFit={false} onPoint={selectPoint} onSelectBlock={selectArea}>
        {areas.length > 0 && <nav className="patrol-area-numbers" aria-label="Selected areas">{areas.map((area, index) => <button type="button" key={index} aria-label={`Go to area ${index + 1}: ${area.label}`} aria-pressed={active === index} className={active === index ? 'is-active' : ''} onClick={() => selectArea(index)}>{index + 1}</button>)}</nav>}
      </PatrolMap>
      <p className="patrol-map-caption">{replacing ? `Tap the new location for area ${active + 1}.` : 'Each map tap adds an area. Drag freely to find the next location. Use the numbers above to revisit an area.'}</p>
    </div><details ref={configRef} className="patrol-workspace__config" open><summary><MapPin size={16} />{active === null ? 'New area defaults' : `Area ${active + 1} configuration`}</summary><div className="patrol-workspace__fields">
      <label>Area name<input aria-label="Area name" maxLength={200} value={selected.label} placeholder={active === null ? 'Optional name for first area' : 'Name this area'} onChange={e => update({ label: e.target.value, autoLabel: false })} /></label>
      <div className="patrol-tinted-panel patrol-time-summary"><strong>{blockTimeLabel(start, selected, active === null ? total : blockOffset(areas, active))}</strong></div>
      <PatrolDurationControl key={active ?? 'new'} value={selected.durationMinutes} remaining={Math.max(0, remaining + (active === null ? 0 : Number(selected.durationMinutes)))} onChange={durationMinutes => update({ durationMinutes })} />
      {active !== null && <label>Coverage type<select aria-label="Coverage type" value={selected.coverageType} onChange={e => update({ coverageType: e.target.value, barangay: '', latitude: undefined, longitude: undefined, geometry: null })}><option value="custom">Custom Area</option><option value="barangay">Whole Barangay</option></select></label>}
      {active !== null && selected.coverageType === 'barangay' ? <><label>Barangay<select aria-label="Barangay" value={selected.barangay} onChange={e => update({ barangay: e.target.value, label: `Barangay ${e.target.value}`, autoLabel: false, geometry: null, latitude: undefined, longitude: undefined })}><option value="">Choose barangay</option>{CABAGAN_BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></label>{!resolved[active]?.geometry && <small className="patrol-notice is-warning">{boundaries.status === 'ready' ? 'Boundary unavailable. Reference location only; outside-coverage alerts cannot be enforced.' : 'Loading barangay coverage…'}</small>}</>
        : <label>Coverage radius (meters)<input type="number" min={50} max={5000} value={selected.radiusMeters} onChange={e => update({ radiusMeters: Number(e.target.value) })} /></label>}
      <label>Transition grace period (minutes)<input type="number" min={0} max={60} value={graceMinutes} onChange={e => onGraceChange(Number(e.target.value))} /></label><small>Time allowed to move between areas before outside-coverage warnings begin. It does not extend duty hours.</small>
      {active !== null && <div className="patrol-draft-actions">{selected.coverageType === 'custom' && <button type="button" aria-pressed={replacing} onClick={() => setReplacing(value => !value)}>{replacing ? 'Cancel location change' : 'Change location'}</button>}<button type="button" className="patrol-danger" onClick={() => remove(active)}>Remove area {active + 1}</button></div>}
      <details className="patrol-coordinate-entry"><summary>Enter exact coordinates</summary><div className="patrol-two-columns"><label>Latitude<input type="number" step="any" value={coordinates.latitude} onChange={e => setCoordinates(c => ({ ...c, latitude: e.target.value }))} /></label><label>Longitude<input type="number" step="any" value={coordinates.longitude} onChange={e => setCoordinates(c => ({ ...c, longitude: e.target.value }))} /></label></div><button type="button" disabled={!coordinates.latitude || !coordinates.longitude} onClick={() => selectPoint({ latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) })}>{replacing ? 'Replace with coordinates' : 'Add area at coordinates'}</button></details>
    </div></details></div>
    <div className="patrol-area-save"><div>{message && <p role="status" className="patrol-notice">{message}</p>}<p role="status">{incomplete || (dirty ? 'All duty hours covered. Save the selected areas together.' : 'All areas are saved. You can continue to review.')}</p></div><button type="button" className="patrol-primary" disabled={Boolean(incomplete) || !dirty} onClick={saveAreas}><Check size={16} />Save areas</button></div>
    {areas.length > 0 && <div className="patrol-saved-schedule"><h4>{dirty ? 'Selected areas' : 'Saved areas'} <span className="patrol-badge">{areas.length}</span></h4><PatrolScheduleTimeline blocks={resolved} type="area" start={start} expanded={expanded} onExpand={setExpanded} onEdit={selectArea} onDelete={remove} onMove={move} /></div>}
  </>
}
