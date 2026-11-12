import { ArrowDown, ArrowUp, Check, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { blockCoverageSummary, blockOffset, blockTimeLabel, hasBlockCoverage, patrolModeLabel, routeIsEnforced } from './patrolScheduleView'

export default function PatrolScheduleTimeline({ blocks, start, type, mode, expanded, onExpand, onEdit, onDelete, onMove, currentIndex = -1 }) {
  return <ol className="patrol-timeline">{blocks.map((block, index) => <li key={index} className={currentIndex === index ? 'is-current' : ''}>
    <button className="patrol-timeline__toggle" type="button" aria-expanded={expanded === index} onClick={() => onExpand(expanded === index ? null : index)}>
      <span className="patrol-timeline__number">{index + 1}</span><span className="patrol-timeline__title"><strong>{block.label || 'Unnamed block'}</strong><small>{blockTimeLabel(start, block, blockOffset(blocks, index))}</small></span>
      <span className="patrol-badge">{currentIndex === index ? 'Current' : currentIndex >= 0 && index === currentIndex + 1 ? 'Next' : `${block.durationMinutes} min`}</span>
      <span className={`patrol-badge ${hasBlockCoverage(block, type) ? 'is-valid' : 'is-warning'}`}><Check size={12} />{hasBlockCoverage(block, type) ? 'Configured' : 'Incomplete'}</span><ChevronDown size={16} />
    </button>
    {expanded === index && <div className="patrol-timeline__details"><p>{type === 'route' && `${patrolModeLabel(mode)} · `}{blockCoverageSummary(block, type)}</p>
      {block.coverageType === 'barangay' && !block.geometry && <small className="patrol-notice is-warning">Reference location only. Outside-coverage alerts require an available barangay boundary.</small>}
      {type === 'route' && !routeIsEnforced(block, mode) && mode !== 'walk' && <small className="patrol-notice is-warning">Road directions unavailable. Route warnings cannot be enforced for this block.</small>}
      {onEdit && <div className="patrol-timeline__actions"><button type="button" onClick={() => onEdit(index)}><Pencil size={14} />Edit {type}</button>
        <button type="button" aria-label={`Move block ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Move block ${index + 1} down`} disabled={index === blocks.length - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={15} /></button>
        <button type="button" aria-label={`Delete block ${index + 1}`} className="patrol-danger" onClick={() => onDelete(index)}><Trash2 size={14} />Delete</button></div>}
    </div>}
  </li>)}</ol>
}
