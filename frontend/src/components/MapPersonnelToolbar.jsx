import { useMemo, useState } from 'react'
import { Megaphone, Search, X } from 'lucide-react'
import '../styles/mapPersonnelToolbar.css'

export default function MapPersonnelToolbar({ personnel, onSelectPersonnel, onAnnounce }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const results = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    // Duty eligibility comes from the active deployment, regardless of GPS freshness.
    return search ? personnel.filter(member => member.isOnDuty === true && !member.isMockPersonnel && [member.name, member.badge, member.id]
      .some(value => String(value || '').toLocaleLowerCase().includes(search))).slice(0, 10) : []
  }, [personnel, query])
  return <div className="map-personnel-toolbar" role="search" aria-label="Find personnel on map">
    <div className="map-personnel-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false) }}
      onKeyDown={event => { if (event.key === 'Escape') { setExpanded(false); event.stopPropagation() } }}>
      <Search aria-hidden="true" />
      <input type="search" aria-label="Search deployed personnel by name or badge" placeholder="Search deployed personnel…" value={query}
        aria-controls="map-personnel-results" aria-expanded={expanded && !!query.trim()}
        onFocus={() => setExpanded(true)} onChange={event => { setQuery(event.target.value); setExpanded(true) }} />
      {query && <button type="button" className="map-search-clear" aria-label="Clear personnel search" onClick={() => { setQuery(''); setExpanded(false) }}><X aria-hidden="true" /></button>}
      {expanded && query.trim() && <div id="map-personnel-results" className="map-personnel-results" aria-label="Personnel results">
        {results.length ? <ul>{results.map(member => <li key={member.id}><button type="button" onClick={() => {
          onSelectPersonnel(member); setExpanded(false); setQuery('')
        }}><strong>{member.name}</strong><span>{member.badge || member.id} · {member.status || 'Personnel'}</span>
          {member.isVisibleOnMap === false && <small>No visible map marker · Open details</small>}
        </button></li>)}</ul> : <p role="status">No matching deployed personnel.</p>}
      </div>}
    </div>
    <button type="button" className="map-announcement-button" onClick={onAnnounce} aria-label="Send announcement" title="Send announcement">
      <Megaphone aria-hidden="true" /><span>Send announcement</span>
    </button>
  </div>
}
