import SelectControl from "../../components/SelectControl"
import { Check, Search, X, Users } from 'lucide-react'
import { useId, useState } from 'react'

export default function PatrolPersonnelSelect({ personnel, ids, onChange, disabledIds = [], disabled = false }) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState('all')
  const id = useId()
  const filtered = personnel.filter(p => `${p.name} ${p.rank || ''} ${p.id} ${p.badge || ''} ${p.badgeNumber || ''}`.toLowerCase().includes(search.trim().toLowerCase()) && (view !== 'selected' || ids.includes(p.id)) && (view !== 'available' || !disabledIds.includes(p.id) && !p.isMockPersonnel))
  return <div className="patrol-personnel">
    <label htmlFor={id}>Find personnel</label>
    <div className="patrol-personnel__toolbar"><div className="patrol-personnel__search"><Search size={17} /><input id={id} type="search" placeholder="Name, rank or badge number" value={search} onChange={e => setSearch(e.target.value)} /></div><label><span className="visually-hidden">Show personnel</span><SelectControl aria-label="Show personnel" value={view} onChange={e => setView(e.target.value)}><option value="all">All personnel</option><option value="selected">Selected ({ids.length})</option><option value="available">Available for selection</option></SelectControl></label></div>
    <div className="patrol-personnel__chips" aria-label="Selected personnel">{ids.map(personId => <span key={personId}>{personnel.find(p => p.id === personId)?.name || personId}<button type="button" disabled={disabled} aria-label={`Remove ${personnel.find(p => p.id === personId)?.name || personId}`} onClick={() => onChange(ids.filter(value => value !== personId))}><X size={13} /></button></span>)}</div>
    <div className="patrol-personnel__list" role="group" aria-label="Personnel selection">{filtered.length ? filtered.map(p => <button type="button" key={p.id} className={`patrol-personnel__card${ids.includes(p.id) ? ' is-selected' : ''}`}
      aria-label={p.name} aria-pressed={ids.includes(p.id)} aria-describedby={`${id}-${p.id}`}
      disabled={disabled || disabledIds.includes(p.id) || p.isMockPersonnel}
      onClick={() => onChange(ids.includes(p.id) ? ids.filter(value => value !== p.id) : [...ids, p.id])}>
      <span className="patrol-avatar" aria-hidden="true">{p.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
      <span className="patrol-personnel__copy"><strong title={p.name}>{p.name}</strong><small id={`${id}-${p.id}`}>{p.rank || 'Personnel'} · {p.badge || p.badgeNumber || p.id}{disabledIds.includes(p.id) ? ' · Assigned to another vehicle' : p.isMockPersonnel ? ' · Preview only' : ''}</small></span>
      {ids.includes(p.id) && <Check className="patrol-personnel__selected" size={16} aria-hidden="true" />}
    </button>) : <p>No personnel matches your search.</p>}</div>
    <small><Users size={14} /> {ids.length} personnel selected</small>
  </div>
}
