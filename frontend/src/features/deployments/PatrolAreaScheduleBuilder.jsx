import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Check, MapPin } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'
import { isInsideCabagan } from '../../utils/cabaganGeofence'
import ConfirmModal from '../../components/ConfirmModal'
import PatrolMap from './PatrolMap'
import PatrolMapSearch from './PatrolMapSearch'
import PatrolDurationControl from './PatrolDurationControl'
import PatrolScheduleTimeline from './PatrolScheduleTimeline'
import { patrolBarangayReferences } from './patrolReferenceCenters'
import { blockOffset, blockTimeLabel, emptyPatrolBlock, moveItem } from './patrolScheduleView'

const renumber = areas => areas.map((area, index) => area.autoLabel ? { ...area, label: `Area ${index + 1}` } : area)
const coverageFor = areas => new Set(areas.map(area => area.coverageType)).size > 1 ? 'mixed' : areas[0]?.coverageType || 'custom'
const areaIssue = (area, index) => {
  const name = `area ${index + 1}`
  if (!area.label?.trim()) return `Enter a name for ${name}.`
  if (!Number.isInteger(area.durationMinutes) || area.durationMinutes < 15 || area.durationMinutes > 1440) return `Set the duration for ${name} to 15–1,440 minutes.`
  if (area.coverageType === 'barangay') return CABAGAN_BARANGAYS.includes(area.barangay) ? '' : `Choose a barangay for ${name}.`
  if (!Number.isFinite(area.latitude) || !Number.isFinite(area.longitude)) return `Select a map location for ${name}.`
  if (!Number.isFinite(area.radiusMeters) || area.radiusMeters < 50 || area.radiusMeters > 5000) return `Set the coverage radius for ${name} to 50–5,000 meters.`
  return ''
}

export default function PatrolAreaScheduleBuilder({ ref, initialBlocks, start, dutyMinutes, dutyError, graceMinutes, onGraceChange, onDirtyChange, onCommit }) {
  const [areas, setAreas] = useState(() => initialBlocks.map(area => ({ ...area })))
  const [saved, setSaved] = useState(() => JSON.stringify(initialBlocks))
  const [active, setActive] = useState(initialBlocks.length ? 0 : null)
  const [template, setTemplate] = useState(emptyPatrolBlock)
  const [coverage, setCoverage] = useState(() => coverageFor(initialBlocks))
  const [pendingCoverage, setPendingCoverage] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [focus, setFocus] = useState(() => initialBlocks[0] || null)
  const [replacing, setReplacing] = useState(false)
  const [message, setMessage] = useState('')
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' })
  const [boundaries, setBoundaries] = useState({ status: 'idle', features: [] })
  const boundaryNeeded = coverage === 'barangay' || areas.some(a => a.coverageType === 'barangay')
  const dirty = JSON.stringify(areas) !== saved
  const configRef = useRef(null)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!boundaryNeeded) return
    let live = true
    apiRequest('/api/patrol/boundaries').then(data => { if (live) setBoundaries({ status: 'ready', features: data.features || [], attribution: data.attribution }) })
      .catch(() => { if (live) setBoundaries({ status: 'error', features: [] }) })
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
  const invalidIndex = resolved.findIndex((area, index) => areaIssue(area, index))
  const incomplete = dutyError ? 'Correct the duty hours above before saving areas.'
    : !areas.length ? coverage === 'barangay' ? 'Choose your first barangay in the sidebar.' : 'Select your first area on the map.'
      : invalidIndex >= 0 ? areaIssue(resolved[invalidIndex], invalidIndex)
        : boundaryNeeded && boundaries.status === 'idle' ? 'Loading barangay coverage…'
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
  useImperativeHandle(ref, () => ({ edit: selectArea, remove, move, reset: () => { setAreas([]); setSaved('[]'); setActive(null); setTemplate(emptyPatrolBlock()); setCoverage('custom'); setPendingCoverage(null); setReplacing(false); setFocus(null); setMessage('') } }))
  const changeCoverage = value => {
    setCoverage(value); setPendingCoverage(null); setAreas([]); setActive(null); setExpanded(null); setReplacing(false); setFocus(null); setMessage(''); setCoordinates({ latitude: '', longitude: '' })
  }
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
    if (coverage !== 'custom' && !(replacing && selected.coverageType === 'custom')) return
    if (!isInsideCabagan(point.latitude, point.longitude)) return setMessage('Choose a location inside the Cabagan boundary.')
    if (replacing && active !== null) { update({ ...point, coverageType: 'custom', barangay: '', geometry: null }); setReplacing(false) }
    else add({ ...point, coverageType: 'custom', barangay: '', geometry: null })
  }
  const selectBarangay = barangay => {
    if (!barangay) return
    const patch = { coverageType: 'barangay', barangay, label: `Barangay ${barangay}`, autoLabel: false, latitude: undefined, longitude: undefined, geometry: null }
    if (replacing && active !== null) { update(patch); setReplacing(false) }
    else {
      if (coverage !== 'barangay' || dutyError || remaining < 15 || areas.length >= 48) return
      add(patch)
    }
    const reference = patrolBarangayReferences.find(area => area.name === `Barangay ${barangay}`)?.referenceCenter
    if (reference) setFocus(reference)
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
      <PatrolMap blocks={resolved.map((area, index) => ({ ...area, offsetMinutes: blockOffset(areas, index) }))} type="area" start={start} focus={focus} selectedIndex={active} autoFit={false} onPoint={coverage === 'custom' || replacing && selected.coverageType === 'custom' ? selectPoint : undefined} onSelectBlock={selectArea}>
        {areas.length > 0 && <nav className="patrol-area-numbers" aria-label="Selected areas">{areas.map((area, index) => <button type="button" key={index} aria-label={`Go to area ${index + 1}: ${area.label}`} aria-pressed={active === index} className={active === index ? 'is-active' : ''} onClick={() => selectArea(index)}>{index + 1}</button>)}</nav>}
      </PatrolMap>
      <p className="patrol-map-caption">{replacing ? selected.coverageType === 'barangay' ? `Choose the replacement barangay for area ${active + 1} in the sidebar.` : `Tap the new location for area ${active + 1}.` : coverage === 'custom' ? 'Each map tap adds an area. Drag freely to find the next location. Use the numbers above to revisit an area.' : 'Choose barangays in the sidebar. Use the numbered map buttons to revisit a selected area.'}</p>
    </div><details ref={configRef} className="patrol-workspace__config" open><summary><MapPin size={16} />{active === null ? 'New area defaults' : `Area ${active + 1} configuration`}</summary><div className="patrol-workspace__fields">
      <label>Coverage type<select aria-label="Coverage type" value={coverage} onChange={e => { if (e.target.value === coverage) return; if (areas.length) setPendingCoverage(e.target.value); else changeCoverage(e.target.value) }}>{coverage === 'mixed' && <option value="mixed" disabled>Existing mixed coverage</option>}<option value="custom">Custom Area</option><option value="barangay">Whole Barangay</option></select></label>
      <small>{coverage === 'mixed' ? 'This existing schedule contains both coverage types. It is preserved until you choose to replace it.' : 'One coverage type applies to this duty. Changing it starts a new area selection.'}</small>
      {(coverage === 'barangay' || replacing && selected.coverageType === 'barangay') && <label>{replacing ? 'Replacement barangay' : areas.length ? 'Next barangay' : 'Barangay'}<select aria-label={replacing ? 'Replacement barangay' : 'Barangay'} value="" disabled={!replacing && (Boolean(dutyError) || remaining < 15 || areas.length >= 48)} onChange={e => selectBarangay(e.target.value)}><option value="">{replacing ? 'Choose replacement barangay' : 'Choose barangay to add'}</option>{CABAGAN_BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></label>}
      <label>Area name<input aria-label="Area name" maxLength={200} value={selected.label} placeholder={active === null ? 'Optional name for first area' : 'Name this area'} onChange={e => update({ label: e.target.value, autoLabel: false })} /></label>
      <div className="patrol-tinted-panel patrol-time-summary"><strong>{blockTimeLabel(start, selected, active === null ? total : blockOffset(areas, active))}</strong></div>
      <PatrolDurationControl key={active ?? 'new'} value={selected.durationMinutes} remaining={Math.max(0, remaining + (active === null ? 0 : Number(selected.durationMinutes)))} onChange={durationMinutes => update({ durationMinutes })} />
      {active !== null && selected.coverageType === 'barangay' && selected.barangay && !resolved[active]?.geometry && <small className="patrol-notice is-warning">{boundaries.status === 'idle' ? 'Loading barangay coverage…' : boundaries.status === 'error' ? 'Barangay boundaries could not be loaded. Reference location only; outside-coverage alerts cannot be enforced.' : 'Boundary unavailable for this barangay. Reference location only; outside-coverage alerts cannot be enforced.'}</small>}
      {(active !== null ? selected.coverageType === 'custom' : coverage === 'custom') && <label>Coverage radius (meters)<input type="number" min={50} max={5000} value={selected.radiusMeters} onChange={e => update({ radiusMeters: Number(e.target.value) })} /></label>}
      <label>Transition grace period (minutes)<input type="number" min={0} max={60} value={graceMinutes} onChange={e => onGraceChange(Number(e.target.value))} /></label><small>Time allowed to move between areas before outside-coverage warnings begin. It does not extend duty hours.</small>
      {coverage === 'custom' && <details className="patrol-coordinate-entry"><summary>Enter exact coordinates</summary><div className="patrol-two-columns"><label>Latitude<input type="number" step="any" value={coordinates.latitude} onChange={e => setCoordinates(c => ({ ...c, latitude: e.target.value }))} /></label><label>Longitude<input type="number" step="any" value={coordinates.longitude} onChange={e => setCoordinates(c => ({ ...c, longitude: e.target.value }))} /></label></div><button type="button" disabled={!coordinates.latitude || !coordinates.longitude} onClick={() => selectPoint({ latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) })}>{replacing ? 'Replace with coordinates' : 'Add area at coordinates'}</button></details>}
    </div><div className="patrol-area-config-footer">
      {message && <p role="status" className="patrol-notice">{message}</p>}
      <p role="status">{incomplete || (dirty ? 'All duty hours covered. Save the selected areas together.' : 'All areas are saved. You can continue to review.')}</p>
      {invalidIndex >= 0 && active !== invalidIndex && <button type="button" onClick={() => selectArea(invalidIndex)}>Fix area {invalidIndex + 1}</button>}
      <div className="patrol-draft-actions">{active !== null && <button type="button" aria-pressed={replacing} onClick={() => { setReplacing(value => !value); if (selected.coverageType === 'barangay' && configRef.current) configRef.current.scrollTop = 0 }}>{replacing ? 'Cancel location change' : selected.coverageType === 'barangay' ? 'Change barangay' : 'Change location'}</button>}<button type="button" className="patrol-primary" disabled={Boolean(incomplete) || !dirty} onClick={saveAreas}><Check size={16} />Save areas</button></div>
    </div></details></div>
    {areas.length > 0 && <div className="patrol-saved-schedule"><h4>{dirty ? 'Selected areas' : 'Saved areas'} <span className="patrol-badge">{areas.length}</span></h4><PatrolScheduleTimeline blocks={resolved} type="area" start={start} expanded={expanded} onExpand={setExpanded} onEdit={selectArea} onDelete={remove} onMove={move} /></div>}
    <ConfirmModal open={Boolean(pendingCoverage)} title="Change coverage type?" message="Changing coverage type replaces all currently selected areas. Your duty hours, personnel and instructions will be kept. Cancel to keep the current locations." confirmLabel="Replace selected areas" cancelLabel="Keep selected areas" onConfirm={() => changeCoverage(pendingCoverage)} onCancel={() => setPendingCoverage(null)} />
  </>
}
