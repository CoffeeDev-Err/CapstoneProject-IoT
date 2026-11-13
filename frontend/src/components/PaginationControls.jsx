import SelectControl from "./SelectControl"
export default function PaginationControls({ page, limit, total, onPageChange, onLimitChange, label = 'Records', disabled = false }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  const current = Math.min(Math.max(1, page), pages)
  const visible = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => current + i - 2).filter(n => n > 0 && n <= pages), pages])].sort((a, b) => a - b)
  return <div className="list-pagination">
    <span role="status">{total ? `${(current - 1) * limit + 1}–${Math.min(current * limit, total)}` : '0'} of {total} {label.toLowerCase()}</span>
    <label>Per page<SelectControl aria-label={`${label} per page`} value={limit} disabled={disabled} onChange={e => onLimitChange(Number(e.target.value))}>{[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}</SelectControl></label>
    <nav aria-label={`${label} pagination`}>
      <button type="button" aria-label={`${label} previous page`} disabled={disabled || current <= 1} onClick={() => onPageChange(current - 1)}>Previous</button>
      {visible.map((n, i) => <span key={n}>{i > 0 && n > visible[i - 1] + 1 && <span className="list-pagination__gap" aria-hidden="true">…</span>}<button type="button" aria-label={`${label} page ${n}`} aria-current={n === current ? 'page' : undefined} disabled={disabled} onClick={() => { if (n !== current) onPageChange(n) }}>{n}</button></span>)}
      <button type="button" aria-label={`${label} next page`} disabled={disabled || current >= pages} onClick={() => onPageChange(current + 1)}>Next</button>
    </nav>
  </div>
}
