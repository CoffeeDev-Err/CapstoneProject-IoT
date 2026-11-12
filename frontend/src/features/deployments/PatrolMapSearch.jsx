import { useId, useRef, useState } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { apiRequest } from '../../services/apiClient'
import { patrolBarangayReferences } from './patrolReferenceCenters'

export default function PatrolMapSearch({ onSelect }) {
  const id = useId()
  const request = useRef(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [active, setActive] = useState(-1)
  const select = result => { onSelect(result); setResults([]); setMessage('Location focused. Select the exact point on the map.'); setActive(-1) }
  const search = async () => {
    if (query.trim().length < 2) return
    const revision = ++request.current
    const local = patrolBarangayReferences.filter(a => a.name.toLowerCase().includes(query.trim().toLowerCase()))
      .map(a => ({ label: `${a.name} (reference center; select the exact point)`, ...a.referenceCenter }))
    setLoading(true); setMessage(''); setResults([]); setActive(-1)
    try {
      const payload = await apiRequest(`/api/patrol/places?q=${encodeURIComponent(query.trim())}`)
      if (revision !== request.current) return
      const places = payload.places || []
      setResults([...places, ...local])
      if (!places.length) setMessage(local.length ? 'No exact place found. Focus a barangay, then pin the actual place.' : 'No results. Search a nearby barangay or navigate the map.')
    } catch {
      if (revision !== request.current) return
      setResults(local); setMessage('Place search unavailable. Use a barangay reference center or navigate the map.')
    } finally { if (revision === request.current) setLoading(false) }
  }
  return <div className="patrol-map-search">
    <label htmlFor={id}>Find a street, place or barangay</label>
    <div className="patrol-map-search__control">
      <Search size={18} aria-hidden="true" />
      <input id={id} type="search" autoComplete="off" maxLength={120} value={query} placeholder="Search within Cabagan…"
        role="combobox" aria-expanded={results.length > 0} aria-controls={`${id}-results`} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-result-${active}` : undefined}
        onChange={e => { ++request.current; setQuery(e.target.value); setResults([]); setMessage(''); setLoading(false); setActive(-1) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && results[active]) select(results[active]); else void search() }
          if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive(i => (i + 1) % results.length) }
          if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive(i => (i <= 0 ? results.length : i) - 1) }
          if (e.key === 'Escape' && results.length) { e.stopPropagation(); setResults([]); setActive(-1) }
        }} />
      {query && <button type="button" className="patrol-map-search__clear" aria-label="Clear map search" onClick={() => { ++request.current; setQuery(''); setResults([]); setMessage(''); setLoading(false); setActive(-1) }}><X size={16} /></button>}
      <button type="button" className="patrol-primary" disabled={loading || query.trim().length < 2} onClick={search}>{loading ? <LoaderCircle size={17} className="patrol-spin" /> : null}{loading ? 'Searching…' : 'Search'}</button>
    </div>
    {message && <small role="status">{message}</small>}
    {results.length > 0 && <ul id={`${id}-results`} role="listbox" aria-label="Map search results" className="patrol-map-search__results">
      {results.map((result, i) => <li id={`${id}-result-${i}`} key={`${result.label}-${i}`} role="option" aria-selected={active === i}>
        <button type="button" onFocus={() => setActive(i)} onClick={() => select(result)}>{result.label}</button>
      </li>)}
    </ul>}
  </div>
}
