import { useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { weekFor } from './patrolPlannerTime'

export default function WeeklyVehicleAssignments({ fleet, personnel, onSaved }) {
  const [weekStart, setWeekStart] = useState(() => weekFor(new Date()))
  const [crews, setCrews] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const saved = fleet.weeks.find(w => w.weekStart === weekStart)
  const name = id => personnel.find(p => p.id === id)?.name || id
  const update = (id, values) => setCrews(current => ({ ...current, [id]: { personnelIds: [], driverId: '', ...current[id], ...values } }))
  const save = async () => {
    setSaving(true); setError('')
    try {
      await apiRequest('/api/patrol/fleet', { method: 'POST', body: JSON.stringify({ weekStart,
        crews: Object.entries(crews).filter(([, c]) => c.personnelIds.length).map(([vehicleId, c]) => ({ vehicleId, ...c })) }) })
      await onSaved(); setCrews({})
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  return <details className="patrol-planner__fleet">
    <summary>Weekly vehicle assignments <span>2 cars · 1 motorcycle</span></summary>
    <p>Monday–Sunday, Philippine time. Each saved vehicle crew and driver is locked for the week. You can still assign the remaining vehicles.</p>
    <label>Week starting Monday<input type="date" value={weekStart} onChange={e => { setWeekStart(e.target.value); setCrews({}); setError('') }} /></label>
    <div className="patrol-planner__vehicle-grid">
      {fleet.vehicles.map(vehicle => {
        const lockedCrew = saved?.crews.find(c => c.vehicleId === vehicle.id)
        const crew = lockedCrew || crews[vehicle.id] || { personnelIds: [], driverId: '' }
        return <fieldset key={vehicle.id}><legend>{vehicle.name}</legend>
          {lockedCrew ? <><p>{crew.personnelIds.length ? crew.personnelIds.map(name).join(', ') : 'No crew assigned'}</p>
            {crew.driverId && <p>Driver: {name(crew.driverId)}</p>}<small>Locked weekly assignment</small></>
            : <><div className="patrol-planner__crew-list">{personnel.map(p => <label key={p.id}>
              <input type="checkbox" checked={crew.personnelIds.includes(p.id)} disabled={saving || saved?.crews.some(c => c.personnelIds.includes(p.id)) || Object.entries(crews).some(([id, c]) => id !== vehicle.id && c.personnelIds.includes(p.id))}
                onChange={e => update(vehicle.id, { personnelIds: e.target.checked ? [...crew.personnelIds, p.id] : crew.personnelIds.filter(id => id !== p.id),
                  driverId: !e.target.checked && crew.driverId === p.id ? '' : crew.driverId })} />{p.name}</label>)}</div>
              <label>Driver<select value={crew.driverId} disabled={saving} onChange={e => update(vehicle.id, { driverId: e.target.value })}>
                <option value="">Choose from assigned personnel</option>{crew.personnelIds.map(id => <option key={id} value={id}>{name(id)}</option>)}
              </select></label></>}
        </fieldset>
      })}
    </div>
    {error && <p role="alert" className="patrol-planner__error">{error}</p>}
    {saved?.crews.length !== fleet.vehicles.length && <button type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save and lock weekly crew'}</button>}
    <details><summary>Assignment history</summary>{fleet.weeks.map(w => <button type="button" key={w.weekStart} onClick={() => { setWeekStart(w.weekStart); setCrews({}); setError('') }}>Week of {w.weekStart}</button>)}</details>
  </details>
}
