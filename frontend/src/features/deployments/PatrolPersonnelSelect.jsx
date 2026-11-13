import SelectControl from "../../components/SelectControl"
import { Search, X, Users } from 'lucide-react'
import { useId, useState } from 'react'
import PaginationControls from '../../components/PaginationControls'

export default function PatrolPersonnelSelect({ personnel, ids, onChange, disabledIds = [], disabled = false }) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const id = useId()
  const filtered = personnel.filter(p => `${p.name} ${p.rank || ''} ${p.id} ${p.badge || ''} ${p.badgeNumber || ''}`.toLowerCase().includes(search.trim().toLowerCase()) && (view !== 'selected' || ids.includes(p.id)) && (view !== 'available' || !disabledIds.includes(p.id) && !p.isMockPersonnel))
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / limit)))
  const visible = filtered.slice((currentPage - 1) * limit, currentPage * limit)
  return <div className="patrol-personnel">
    <label htmlFor={id}>Find personnel</label>
    <div className="patrol-personnel__toolbar"><div className="patrol-personnel__search"><Search size={17} /><input id={id} type="search" placeholder="Name, rank or badge number" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></div><label><span className="visually-hidden">Show personnel</span><SelectControl aria-label="Show personnel" value={view} onChange={e => { setView(e.target.value); setPage(1) }}><option value="all">All personnel</option><option value="selected">Selected ({ids.length})</option><option value="available">Available for selection</option></SelectControl></label></div>
    <div className="patrol-personnel__chips" aria-label="Selected personnel">{ids.map(personId => <span key={personId}>{personnel.find(p => p.id === personId)?.name || personId}<button type="button" disabled={disabled} aria-label={`Remove ${personnel.find(p => p.id === personId)?.name || personId}`} onClick={() => onChange(ids.filter(value => value !== personId))}><X size={13} /></button></span>)}</div>
    <div className="patrol-personnel__list">{visible.length ? visible.map(p => <label key={p.id} className={ids.includes(p.id) ? 'is-selected' : ''}>
      <input type="checkbox" aria-label={p.name} checked={ids.includes(p.id)} disabled={disabled || disabledIds.includes(p.id) || p.isMockPersonnel} onChange={e => onChange(e.target.checked ? [...ids, p.id] : ids.filter(value => value !== p.id))} />
      <span className="patrol-avatar" aria-hidden="true">{p.name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
      <span><strong>{p.name}</strong><small>{p.rank || 'Personnel'} · {p.id}{disabledIds.includes(p.id) ? ' · Assigned to another vehicle' : ''}</small></span>
    </label>) : <p>No personnel matches your search.</p>}</div>
    <small><Users size={14} /> {ids.length} personnel selected across all pages</small>
    {personnel.length > 10 && <PaginationControls label="Personnel" page={currentPage} limit={limit} total={filtered.length} onPageChange={setPage} onLimitChange={value => { setLimit(value); setPage(1) }} />}
  </div>
}
