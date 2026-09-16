import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../services/apiClient'
import { getReportsList } from '../services/operations'
import { useAccessibleDialog } from '../hooks/useAccessibleDialog'
import { formatReportDateTime } from '../features/reports/reportPresentation'
import { socket } from '../services/socket'

const loadActiveTasks = async (signal) => {
  const rows = []
  let page = 1
  let totalPages = 1
  do {
    const result = await apiRequest(`/api/tasks?view=active&limit=100&page=${page}`, { signal })
    rows.push(...(result.data || [])); totalPages = result.pagination?.totalPages || 1; page += 1
  } while (page <= totalPages)
  return rows.filter((task) => ['open', 'full'].includes(task.status))
}
export default function DashboardActivityModal({ kind, onClose }) {
  const navigate = useNavigate()
  const closeRef = useRef(null)
  const dialogRef = useAccessibleDialog(true, onClose, closeRef)
  const [result, setResult] = useState({ rows: [], loading: true, error: '' })
  const [retry, setRetry] = useState(0)
  const isTasks = kind === 'tasks'
  useEffect(() => {
    let controller
    let active = true
    const load = async () => {
      controller?.abort(); controller = new AbortController()
      const current = controller
      try {
        const rows = isTasks ? await loadActiveTasks(current.signal)
          : (await getReportsList({ category: 'incident', caseStatus: 'open', signal: current.signal })).data
        if (active && !current.signal.aborted) setResult({ rows, loading: false, error: '' })
      } catch (error) {
        if (active && !current.signal.aborted) setResult({ rows: [], loading: false, error: error.message })
      }
    }
    load()
    const events = ['task:created', 'task:updated', 'report:submitted', 'report:updated', 'report:resolved']
    events.forEach((event) => socket.on(event, load))
    return () => { active = false; controller?.abort(); events.forEach((event) => socket.off(event, load)) }
  }, [isTasks, retry])
  const open = (path, state) => { onClose(); navigate(path, { state }) }
  return createPortal(<div className="activity-modal-backdrop" onClick={onClose}>
    <section ref={dialogRef} className="activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
      <header><h3 id="activity-modal-title">{isTasks ? 'Active backup requests' : 'Open incidents'}</h3>
        <p>{result.loading ? 'Loading current records...' : `${result.rows.length} current ${isTasks ? 'requests' : 'incidents'}`}</p></header>
      <div className="activity-modal__body">
        {result.loading && <p role="status">Loading...</p>}
        {result.error && <div role="alert">{result.error}<button className="report-action-btn" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
        {!result.loading && !result.error && result.rows.length === 0 && <p>No {isTasks ? 'active backup requests' : 'unresolved incidents'}.</p>}
        {result.rows.map((row) => <article className="activity-record" key={row.id}>
          <h4>{row.title || row.id}</h4>
          <dl>
            <div><dt>{isTasks ? 'Request ID' : 'Report ID'}</dt><dd>{row.id}</dd></div>
            <div><dt>{isTasks ? 'Requester' : 'Officer'}</dt><dd>{isTasks ? row.requester_name : row.officer}</dd></div>
            <div><dt>Location</dt><dd>{row.location || 'Not recorded'}</dd></div>
            <div><dt>Date / time</dt><dd>{formatReportDateTime(isTasks ? row.created_at : row.date_time)}</dd></div>
            <div><dt>Status</dt><dd>{row.status || row.case_status}</dd></div>
            {isTasks ? <div><dt>Responders {(row.responders || []).length}/3</dt><dd>{(row.responders || []).map((r) => [r.rank, r.name].filter(Boolean).join(' ')).join(', ') || 'None yet'}</dd></div>
              : <div><dt>Severity</dt><dd>{row.severity}/5</dd></div>}
          </dl>
          <div className="activity-record__actions">{isTasks ? <>
            <button className="report-action-btn" onClick={() => open('/map', { taskId: row.id, notificationRequestId: Date.now() })}>View on Map</button>
            <button className="report-action-btn report-action-btn--primary" onClick={() => open('/map', { taskId: row.id, notificationRequestId: Date.now() })}>Open Request</button>
          </> : <button className="report-action-btn report-action-btn--primary" onClick={() => open(`/reports?report=${encodeURIComponent(row.id)}`)}>View Report</button>}</div>
        </article>)}
      </div>
      <footer><button ref={closeRef} className="report-action-btn report-action-btn--danger-outline" onClick={onClose}>Close</button></footer>
    </section>
  </div>, document.body)
}
