import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardCheck, X } from 'lucide-react'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import PatrolMap from './PatrolMap'
import PatrolScheduleTimeline from './PatrolScheduleTimeline'
import { blockOffset, patrolModeLabel } from './patrolScheduleView'
import { formatDeploymentStatus } from './deploymentForm'

const dutyDate = value => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
const dutyTime = value => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(value))

export default function PatrolScheduleDialog({ assignment, group = [], onClose, onReassign, onConfirm, saving, onEdit, onDelete, onMove }) {
  const ref = useAccessibleDialog(true, onClose)
  const [expanded, setExpanded] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer) }, [])
  const blocks = (assignment.scheduleBlocks?.length ? assignment.scheduleBlocks : [{ label: assignment.patrolArea, coverageType: assignment.deploymentType === 'point' ? 'custom' : 'barangay', radiusMeters: 200, latitude: assignment.latitude, longitude: assignment.longitude, durationMinutes: (Date.parse(assignment.shiftEnd) - Date.parse(assignment.shiftStart)) / 60000 }]).map((b, i, all) => ({ ...b, offsetMinutes: blockOffset(all, i) }))
  const elapsed = (now - Date.parse(assignment.shiftStart)) / 60000
  const current = assignment.status === 'active' ? blocks.findIndex(b => elapsed >= b.offsetMinutes && elapsed < b.offsetMinutes + b.durationMinutes) : -1
  const crew = group.length ? group : [assignment]
  const vehicle = assignment.vehicleId?.replaceAll('-', ' ')
  const context = [patrolModeLabel(assignment.patrolMode), vehicle, crew.map(a => a.personnelName).filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  return createPortal(<div className="deployment-point-backdrop"><section className="patrol-dialog patrol-theme patrol-review" role="dialog" aria-modal="true" aria-labelledby="patrol-review-title" tabIndex={-1} ref={ref}>
    <header className="patrol-dialog__header"><div><span className="patrol-eyebrow"><ClipboardCheck size={16} />{onConfirm ? 'Final review' : 'Deployment details'}</span><h3 id="patrol-review-title">{onConfirm ? 'Review patrol schedule' : assignment.patrolArea}</h3></div><button type="button" aria-label="Close patrol schedule" disabled={saving} onClick={onClose}><X size={20} /></button></header>
    <div className="patrol-review__layout"><div className="patrol-review__map"><PatrolMap blocks={blocks} type={assignment.deploymentType === 'route' ? 'route' : 'area'} mode={assignment.patrolMode} areaTravelMode={assignment.areaTravelMode || ''} start={assignment.shiftStart} selectedIndex={current} context={context} />
      <p className="patrol-map-caption">{assignment.deploymentType === 'route' ? 'Solid blue: saved road or walking path with its corridor. Dashed blue: transitions between blocks. Gray: waypoint guide with no enforced road coverage.' : assignment.areaTravelMode ? 'Solid blue: suggested travel path between numbered areas. Dashed blue: sequence when directions are unavailable. Coverage alerts use the areas, not this suggested path.' : 'Numbered areas show assignment order. Dashed blue lines indicate the sequence, not the route personnel must take.'}</p></div>
      <aside className="patrol-review__details"><div className="patrol-review__summary">
        <section className="patrol-summary-card"><div className="patrol-summary-card__heading"><strong>{assignment.deploymentType === 'route' ? patrolModeLabel(assignment.patrolMode) : 'Area Patrol'}</strong><span className={`patrol-badge ${assignment.status === 'active' ? 'is-valid' : assignment.status === 'scheduled' || assignment.status === 'ended_early' ? 'is-warning' : ''}`}>{assignment.status ? formatDeploymentStatus(assignment.status) : 'Draft'}</span></div>
          <div className="patrol-duty-summary"><div><small>Start · PHT</small><strong>{dutyTime(assignment.shiftStart)}</strong><small>{dutyDate(assignment.shiftStart)}</small></div><div><small>Planned end · PHT</small><strong>{dutyTime(assignment.shiftEnd)}</strong><small>{dutyDate(assignment.shiftEnd)}</small></div></div>
          <div className="patrol-summary-meta"><span>{Math.round((Date.parse(assignment.shiftEnd) - Date.parse(assignment.shiftStart)) / 60000)} minutes</span><span>{blocks.length} {assignment.deploymentType === 'route' ? blocks.length === 1 ? 'route' : 'routes' : blocks.length === 1 ? 'area' : 'areas'}</span></div>
          {assignment.endedAt && assignment.status !== 'active' && assignment.status !== 'scheduled' && <p className="patrol-summary-ended">{assignment.status === 'cancelled' ? 'Cancelled' : 'Ended'} {dutyDate(assignment.endedAt)}, {dutyTime(assignment.endedAt)}{assignment.endedBy && assignment.endedBy !== 'system' ? ` · By ${assignment.endedBy}` : ''}</p>}
        </section>
        <section className="patrol-summary-card"><div className="patrol-summary-card__heading"><h4>{vehicle ? `${vehicle} · Locked crew` : 'Assigned personnel'}</h4><span className="patrol-badge">{crew.length}</span></div><ul className="patrol-crew-summary">{crew.map(a => <li key={a.personnelId || a.id}><span>{a.personnelName || a.personnelId}</span><small>{assignment.vehicleCrew?.driverId === a.personnelId ? 'Driver' : a.rank || 'Crew'}</small></li>)}</ul></section>
        <section className="patrol-summary-card"><h4>Instructions</h4><p className="patrol-instructions">{assignment.notes || 'No additional instructions.'}</p><div className="patrol-summary-meta"><span>Transition grace</span><strong>{assignment.transitionGraceMinutes ?? 10} min</strong></div></section>
        {current >= 0 && <section className="patrol-current-next"><div><small>Current</small><strong>{blocks[current].label}</strong></div><div><small>Next</small><strong>{blocks[current + 1]?.label || 'End of duty'}</strong></div></section>}</div>
        <h4>Schedule timeline</h4><PatrolScheduleTimeline blocks={blocks} start={assignment.shiftStart} type={assignment.deploymentType === 'route' ? 'route' : 'area'} mode={assignment.patrolMode} expanded={expanded} onExpand={setExpanded} currentIndex={current} onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
      </aside></div>
    <footer className="patrol-dialog__footer"><button type="button" disabled={saving} onClick={onClose}>{onConfirm ? 'Return to map configuration' : 'Close'}</button>{onReassign && ['active', 'scheduled'].includes(assignment.status) && <button type="button" className="patrol-primary" onClick={onReassign}>Reassign{vehicle ? ' vehicle group' : ''}</button>}{onConfirm && <button type="button" className="patrol-primary" disabled={saving} onClick={onConfirm}><ClipboardCheck size={16} />{saving ? 'Saving…' : assignment.status === 'scheduled' ? 'Save scheduled deployment' : 'Save and deploy'}</button>}</footer>
  </section></div>, document.body)
}
