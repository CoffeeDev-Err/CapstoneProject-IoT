import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Megaphone, X, Send, Users } from 'lucide-react'
import { useAccessibleDialog } from '../hooks/useAccessibleDialog'
import { sendPersonnelAnnouncement } from '../services/notifications'
import { requestErrorMessage } from '../utils/requestFeedback'

const initialForm = { message: '', location: '', when: 'immediately', eventTime: '' }
const announcementTime = value => new Date(value).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) + ' PHT'

export default function AnnouncementDialog({ open, onClose, onSent }) {
  const [form, setForm] = useState(initialForm)
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(null)
  const busyRef = useRef(false)
  const messageRef = useRef(null)
  const close = () => { if (!busyRef.current) onClose() }
  const dialogRef = useAccessibleDialog(open, close, messageRef)
  const eventAt = form.when === 'scheduled' && form.eventTime ? `${form.eventTime}:00+08:00` : null
  const update = event => { setForm(current => ({ ...current, [event.target.name]: event.target.value })); setError('') }
  const validate = () => {
    if (!form.message.trim()) return 'Enter the message or reason for the announcement.'
    if (form.when === 'scheduled' && (!eventAt || !Number.isFinite(Date.parse(eventAt)) || Date.parse(eventAt) <= Date.now())) {
      return 'Choose a future event date and time (PHT), or select Immediately.'
    }
    return ''
  }
  const submit = async event => {
    event.preventDefault()
    if (busyRef.current) return
    if (!requestRef.current) {
      const problem = validate()
      if (problem) { setError(problem); return }
      if (!review) { setReview(true); setError(''); return }
      // randomUUID is unavailable on some local HTTP/LAN deployments.
      const requestId = globalThis.crypto?.randomUUID?.() || `announce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
      requestRef.current = { request_id: requestId, message: form.message.trim(), location: form.location.trim(),
        when: form.when, event_at: eventAt }
      setLocked(true)
    }
    busyRef.current = true
    setBusy(true); setError('')
    try {
      const result = await sendPersonnelAnnouncement(requestRef.current)
      requestRef.current = null
      setLocked(false)
      setForm(initialForm); setReview(false)
      onSent(result.announcement)
      onClose()
    } catch (failure) {
      // Retain the immutable request after an ambiguous connection failure so a
      // retry cannot send a second broadcast, including after closing/reopening.
      if (failure.status >= 400 && failure.status < 500 && failure.status !== 408) { requestRef.current = null; setLocked(false) }
      setError(requestErrorMessage(failure, { action: 'send the announcement' }))
    } finally { busyRef.current = false; setBusy(false) }
  }
  if (!open) return null
  return createPortal(<div className="modal-backdrop announcement-backdrop" onClick={close}>
    <section ref={dialogRef} className="announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-heading"
      onClick={event => event.stopPropagation()} tabIndex={-1}>
      <header className="announcement-dialog__header">
        <span className="announcement-dialog__icon"><Megaphone aria-hidden="true" /></span>
        <div><h2 id="announcement-heading">{review ? 'Review announcement' : 'Send announcement'}</h2>
          <p>Keep all personnel informed.</p></div>
        <button type="button" className="announcement-close" aria-label="Close announcement" onClick={close} disabled={busy}><X aria-hidden="true" /></button>
      </header>
      <form onSubmit={submit}>
        <div className="announcement-audience"><Users aria-hidden="true" /><span><strong>All active police accounts</strong><small>Includes on-duty and off-duty personnel.</small></span></div>
        {!review ? <div className="announcement-fields">
          <label htmlFor="announcement-message">Message / reason <span aria-hidden="true">*</span></label>
          <textarea ref={messageRef} id="announcement-message" name="message" value={form.message} onChange={update} required maxLength={600} rows={4}
            placeholder="Please attend the operational briefing…" />
          <small className="announcement-count">{form.message.length}/600</small>
          <label htmlFor="announcement-location">Location <span className="announcement-optional">Optional</span></label>
          <input id="announcement-location" name="location" value={form.location} onChange={update} maxLength={200} placeholder="e.g. Police station briefing room" />
          <fieldset><legend>When should personnel attend?</legend><div className="announcement-when">
            <label><input type="radio" name="when" value="immediately" checked={form.when === 'immediately'} onChange={update} />Immediately</label>
            <label><input type="radio" name="when" value="scheduled" checked={form.when === 'scheduled'} onChange={update} />Date and time</label>
          </div></fieldset>
          {form.when === 'scheduled' && <><label htmlFor="announcement-event-time">Event date and time (PHT)</label>
            <input id="announcement-event-time" name="eventTime" type="datetime-local" value={form.eventTime} onChange={update} required /></>}
        </div> : <div className="announcement-preview">
          <span className="announcement-preview__label">Personnel announcement</span>
          <p>{form.message.trim()}</p>
          <dl>{form.location.trim() && <div><dt>Location</dt><dd>{form.location.trim()}</dd></div>}
            <div><dt>When</dt><dd>{form.when === 'immediately' ? 'Immediately' : announcementTime(eventAt)}</dd></div></dl>
        </div>}
        <p className="announcement-help">The announcement is sent now. The selected time tells personnel when to attend.</p>
        {error && <div className="announcement-error" role="alert">{error}{locked && <p>The send result is unconfirmed. Retry this announcement to check or complete the same request.</p>}</div>}
        <footer className="announcement-actions">
          <button type="button" className="report-action-btn report-action-btn--secondary" disabled={busy} onClick={review && !locked ? () => { setReview(false); setError('') } : close}>
            {review && !locked ? 'Back to edit' : 'Close'}</button>
          <button type="submit" className="report-action-btn report-action-btn--primary" disabled={busy}>
            {review && <Send aria-hidden="true" />}{busy ? 'Sending…' : locked ? 'Retry send' : review ? 'Send to all personnel' : 'Review announcement'}
          </button>
        </footer>
      </form>
    </section>
  </div>, document.body)
}
