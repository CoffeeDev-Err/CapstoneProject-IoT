import SelectControl from "../../components/SelectControl"
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Car, LockKeyhole, X } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import { weekFor } from './patrolPlannerTime'
import PatrolPersonnelSelect from './PatrolPersonnelSelect'

export default function WeeklyVehicleAssignments({ fleet, personnel, onSaved, onClose, initialWeek, initialVehicle }) {
  const [weekStart, setWeekStart] = useState(initialWeek || weekFor(new Date()))
  const [vehicleId, setVehicleId] = useState(initialVehicle || fleet.vehicles[0]?.id || '')
  const [ids, setIds] = useState([])
  const [driverId, setDriverId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const close = () => { if (!saving) onClose() }
  const dialogRef = useAccessibleDialog(true, close)
  const saved = fleet.weeks.find(w => w.weekStart === weekStart)
  const crew = saved?.crews.find(c => c.vehicleId === vehicleId)
  const name = id => personnel.find(p => p.id === id)?.name || id
  const reset = () => { setIds([]); setDriverId(''); setError('') }
  const save = async () => {
    if (weekFor(`${weekStart}T00:00:00+08:00`) !== weekStart) return setError('Choose the Monday starting the assignment week.')
    if (!vehicleId || !ids.length || !ids.includes(driverId)) return setError('Choose a vehicle, its crew, and a driver from the selected crew.')
    setSaving(true); setError('')
    try {
      await apiRequest('/api/patrol/fleet', { method: 'POST', body: JSON.stringify({ weekStart, crews: [{ vehicleId, personnelIds: ids, driverId }] }) })
      await onSaved(); reset()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  return createPortal(<div className="deployment-point-backdrop" onMouseDown={close}>
    <section className="patrol-dialog patrol-theme patrol-crew-manager" role="dialog" aria-modal="true" aria-labelledby="weekly-crew-title" tabIndex={-1} ref={dialogRef} onMouseDown={e => e.stopPropagation()}>
      <header className="patrol-dialog__header"><div><span className="patrol-eyebrow"><Car size={16} /> Fleet management</span><h3 id="weekly-crew-title">Weekly vehicle crews</h3></div><button type="button" disabled={saving} aria-label="Close weekly vehicle crews" onClick={close}><X size={19} /></button></header>
      <div className="patrol-dialog__body">
        <p>Monday–Sunday, Philippine time. Saving locks the crew and driver for that week. Personnel rotate the following week.</p>
        <div className="patrol-two-columns"><label>Week starting Monday<input type="date" value={weekStart} disabled={saving} onChange={e => { setWeekStart(e.target.value); reset() }} /></label>
          <label>Vehicle<SelectControl aria-label="Vehicle" value={vehicleId} disabled={saving} onChange={e => { setVehicleId(e.target.value); reset() }}><option value="">Choose vehicle</option>{fleet.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</SelectControl></label></div>
        {crew ? <div className="patrol-tinted-panel"><span className="patrol-badge is-valid"><LockKeyhole size={14} /> Locked for this week</span><ul className="patrol-crew-summary">{crew.personnelIds.map(id => <li key={id}><strong>{name(id)}</strong><span>{crew.driverId === id ? 'Driver' : 'Crew'}</span></li>)}</ul></div>
          : <><PatrolPersonnelSelect personnel={personnel} ids={ids} disabled={saving} disabledIds={saved?.crews.flatMap(c => c.personnelIds) || []} onChange={next => { setIds(next); if (!next.includes(driverId)) setDriverId('') }} />
            <label>Driver<SelectControl aria-label="Driver" value={driverId} disabled={saving} onChange={e => setDriverId(e.target.value)}><option value="">Choose from selected crew</option>{ids.map(id => <option key={id} value={id}>{name(id)}</option>)}</SelectControl></label></>}
        <div className="patrol-fleet-summary"><h4>Other vehicles this week</h4>{fleet.vehicles.filter(v => v.id !== vehicleId).map(v => {
          const other = saved?.crews.find(c => c.vehicleId === v.id)
          return <div key={v.id}><span>{v.name}</span><small>{other ? `${other.personnelIds.map(name).join(', ')} · Locked` : 'Not configured'}</small></div>
        })}</div>
        {error && <div role="alert" className="patrol-notice is-error">{error}<button type="button" disabled={saving} onClick={async () => { try { await onSaved(); setError('') } catch (e) { setError(e.message) } }}>Refresh saved crews</button></div>}
      </div>
      <footer className="patrol-dialog__footer"><button type="button" disabled={saving} onClick={close}>Close</button>{!crew && <button type="button" className="patrol-primary" disabled={saving || !vehicleId || !ids.length || !driverId} onClick={save}><LockKeyhole size={16} />{saving ? 'Saving…' : 'Save and lock weekly crew'}</button>}</footer>
    </section>
  </div>, document.body)
}
