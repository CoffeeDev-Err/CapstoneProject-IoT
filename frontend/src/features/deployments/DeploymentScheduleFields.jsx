import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import {
  DEPLOYMENT_MODES,
  formatDateTimePreview,
  getCurrentDateTimeLocalValue,
} from './deploymentForm'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTES = Array.from({ length: 60 }, (_, index) => index)
const pad = (value) => String(value).padStart(2, '0')

const parseLocalValue = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const parsed = new Date(year, month - 1, day, hour, minute)
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hour
    || parsed.getMinutes() !== minute
  ) return null
  return { year, month, day, hour, minute }
}

const toLocalValue = ({ year, month, day, hour, minute }) => (
  `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
)

const clampLocalValue = (parts, minimum, maximum) => {
  const value = toLocalValue(parts)
  if (minimum && value < minimum) return minimum
  if (maximum && value > maximum) return maximum
  return value
}

const dateKey = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`

const formatTriggerValue = (value) => {
  const parts = parseLocalValue(value)
  if (!parts) return 'Select date and time'
  const hour = parts.hour % 12 || 12
  const period = parts.hour >= 12 ? 'PM' : 'AM'
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year} ${hour}:${pad(parts.minute)} ${period}`
}

const fullDateLabel = ({ year, month, day }) => new Intl.DateTimeFormat('en-PH', {
  month: 'long', day: 'numeric', year: 'numeric',
}).format(new Date(year, month - 1, day))

function DateTimePickerField({
  align = 'left', ariaLabel, describedBy, invalid, maximum, minimum, onChange, value,
}) {
  const initial = parseLocalValue(value) || parseLocalValue(minimum) || parseLocalValue(getCurrentDateTimeLocalValue())
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState({ year: initial.year, month: initial.month })
  const wrapperRef = useRef(null)
  const triggerRef = useRef(null)
  const pickerId = `assignment-${ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-picker`
  const selected = parseLocalValue(value)
  const minimumParts = parseLocalValue(minimum)
  const maximumParts = parseLocalValue(maximum)
  const fallback = selected || minimumParts || parseLocalValue(getCurrentDateTimeLocalValue())

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const calendarDays = useMemo(() => {
    const firstWeekday = new Date(visibleMonth.year, visibleMonth.month - 1, 1).getDay()
    const daysInMonth = new Date(visibleMonth.year, visibleMonth.month, 0).getDate()
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => ({
        year: visibleMonth.year,
        month: visibleMonth.month,
        day: index + 1,
      })),
    ]
  }, [visibleMonth])

  const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
    .format(new Date(visibleMonth.year, visibleMonth.month - 1, 1))
  const selectedDateKey = selected ? dateKey(selected) : ''
  const minimumDateKey = minimumParts ? dateKey(minimumParts) : ''
  const maximumDateKey = maximumParts ? dateKey(maximumParts) : ''
  const displayHour = (selected || fallback).hour % 12 || 12
  const displayMinute = (selected || fallback).minute
  const displayPeriod = (selected || fallback).hour >= 12 ? 'PM' : 'AM'

  const openPicker = () => {
    const next = selected || minimumParts || fallback
    setVisibleMonth({ year: next.year, month: next.month })
    setOpen((current) => !current)
  }

  const changeMonth = (offset) => {
    const next = new Date(visibleMonth.year, visibleMonth.month - 1 + offset, 1)
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() + 1 })
  }

  const monthUnavailable = (offset) => {
    const nextStart = new Date(visibleMonth.year, visibleMonth.month - 1 + offset, 1)
    const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 0)
    const nextStartKey = `${nextStart.getFullYear()}-${pad(nextStart.getMonth() + 1)}-01`
    const nextEndKey = `${nextEnd.getFullYear()}-${pad(nextEnd.getMonth() + 1)}-${pad(nextEnd.getDate())}`
    return Boolean(
      (minimumDateKey && nextEndKey < minimumDateKey)
      || (maximumDateKey && nextStartKey > maximumDateKey)
    )
  }

  const selectDate = (parts) => {
    const base = selected || fallback
    onChange(clampLocalValue({ ...base, ...parts }, minimum, maximum))
  }

  const updateTime = ({ hour12 = displayHour, minute = displayMinute, period = displayPeriod }) => {
    const base = selected || fallback
    const normalizedHour = (Number(hour12) % 12) + (period === 'PM' ? 12 : 0)
    onChange(clampLocalValue({ ...base, hour: normalizedHour, minute: Number(minute) }, minimum, maximum))
  }

  return (
    <div className={`assignment-datetime-picker assignment-datetime-picker--${align}`} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="settings-input w-100 assignment-datetime-trigger"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? pickerId : undefined}
        onClick={openPicker}
      >
        <span className={selected ? '' : 'is-placeholder'}>{formatTriggerValue(value)}</span>
        <CalendarDays aria-hidden="true" />
      </button>

      {open && (
        <section id={pickerId} className="assignment-datetime-popover" role="dialog" aria-label={ariaLabel}>
          <header className="assignment-calendar-header">
            <button type="button" aria-label="Previous month" disabled={monthUnavailable(-1)} onClick={() => changeMonth(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong aria-live="polite">{monthLabel}</strong>
            <button type="button" aria-label="Next month" disabled={monthUnavailable(1)} onClick={() => changeMonth(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </header>

          <div className="assignment-calendar-grid" role="grid" aria-label={monthLabel}>
            {WEEKDAYS.map((weekday) => <span className="assignment-calendar-weekday" key={weekday}>{weekday}</span>)}
            {calendarDays.map((parts, index) => {
              if (!parts) return <span aria-hidden="true" key={`empty-${index}`} />
              const key = dateKey(parts)
              const disabled = Boolean(
                (minimumDateKey && key < minimumDateKey)
                || (maximumDateKey && key > maximumDateKey)
              )
              return (
                <button
                  type="button"
                  className={`assignment-calendar-day${key === selectedDateKey ? ' is-selected' : ''}`}
                  key={key}
                  disabled={disabled}
                  aria-label={`Choose ${fullDateLabel(parts)}`}
                  aria-pressed={key === selectedDateKey}
                  onClick={() => selectDate(parts)}
                >
                  {parts.day}
                </button>
              )
            })}
          </div>

          <div className="assignment-time-controls">
            <Clock3 aria-hidden="true" />
            <label>
              <span>Hour</span>
              <select aria-label={`${ariaLabel} hour`} value={displayHour}
                onChange={(event) => updateTime({ hour12: event.target.value })}>
                {HOURS.map((hour) => <option key={hour} value={hour}>{pad(hour)}</option>)}
              </select>
            </label>
            <span aria-hidden="true">:</span>
            <label>
              <span>Minute</span>
              <select aria-label={`${ariaLabel} minute`} value={displayMinute}
                onChange={(event) => updateTime({ minute: event.target.value })}>
                {MINUTES.map((minute) => <option key={minute} value={minute}>{pad(minute)}</option>)}
              </select>
            </label>
            <label>
              <span>Period</span>
              <select aria-label={`${ariaLabel} period`} value={displayPeriod}
                onChange={(event) => updateTime({ period: event.target.value })}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </label>
          </div>

          <footer className="assignment-datetime-actions">
            <button type="button" onClick={() => onChange('')} disabled={!value}>Clear</button>
            <button type="button" className="is-primary" onClick={() => setOpen(false)}>Done</button>
          </footer>
        </section>
      )}
    </div>
  )
}

export function DeploymentTimingSelector({ disabled, mode, onChange }) {
  const startsNow = mode === DEPLOYMENT_MODES.START_NOW
  return (
    <fieldset className="assignment-mode-selector mb-3" disabled={disabled}>
      <legend>Deployment Timing</legend>
      <div
        className="assignment-mode-options smooth-underline-control"
        style={{ '--smooth-underline-left': startsNow ? '25%' : '75%' }}
      >
        <label className={`assignment-mode-option${startsNow ? ' is-active' : ''}`}>
          <input type="radio" name="deployment-mode" value={DEPLOYMENT_MODES.START_NOW}
            checked={startsNow} onChange={() => onChange(DEPLOYMENT_MODES.START_NOW)} />
          <span><strong>Start Now</strong><small>Begin using the current date and time.</small></span>
        </label>
        <label className={`assignment-mode-option${startsNow ? '' : ' is-active'}`}>
          <input type="radio" name="deployment-mode" value={DEPLOYMENT_MODES.SCHEDULE_LATER}
            checked={!startsNow} onChange={() => onChange(DEPLOYMENT_MODES.SCHEDULE_LATER)} />
          <span><strong>Schedule for Later</strong><small>Keep personnel Off Duty until the future shift begins.</small></span>
        </label>
      </div>
      <div className={`assignment-mode-status assignment-mode-status--${startsNow ? 'start' : 'scheduled'}`} aria-live="polite">
        <span className="assignment-mode-status__dot" aria-hidden="true" />
        <span>
          <strong>{startsNow ? 'Start Now' : 'Schedule for Later'}</strong>{' → '}
          {startsNow ? 'Personnel becomes On Duty immediately.' : 'Personnel remains Off Duty until shift start.'}
        </span>
      </div>
    </fieldset>
  )
}

export function DeploymentScheduleFields({
  maximumShiftEnd, minimumShiftEnd, minimumShiftStart, mode, onChange,
  shiftEnd, shiftEndHint, shiftStart, shiftStartHint, shiftEndInvalid, shiftStartInvalid,
}) {
  const startLabel = mode === DEPLOYMENT_MODES.SCHEDULE_LATER
    ? 'Scheduled deployment start date and time'
    : 'Deployment shift start date and time'
  return (
    <>
      <div className="assignment-field assignment-field--start">
        <span>{mode === DEPLOYMENT_MODES.SCHEDULE_LATER ? 'Scheduled Start *' : 'Shift Start *'}</span>
        <DateTimePickerField
          ariaLabel={startLabel}
          describedBy="assignment-shift-start-hint"
          invalid={shiftStartInvalid}
          minimum={minimumShiftStart}
          onChange={(value) => onChange('shiftStart', value)}
          value={shiftStart}
        />
        <small className="assignment-field__datetime-preview">{formatDateTimePreview(shiftStart)}</small>
        <small id="assignment-shift-start-hint"
          className={`assignment-field__hint${shiftStartInvalid ? ' is-error' : ''}`}>{shiftStartHint}</small>
      </div>
      <div className="assignment-field assignment-field--end">
        <span>Shift End *</span>
        <DateTimePickerField
          align="right"
          ariaLabel="Deployment shift end date and time"
          describedBy="assignment-shift-end-hint"
          invalid={shiftEndInvalid}
          maximum={maximumShiftEnd}
          minimum={minimumShiftEnd}
          onChange={(value) => onChange('shiftEnd', value)}
          value={shiftEnd}
        />
        <small className="assignment-field__datetime-preview">{formatDateTimePreview(shiftEnd)}</small>
        <small id="assignment-shift-end-hint"
          className={`assignment-field__hint${shiftEndInvalid ? ' is-error' : ''}`}>{shiftEndHint}</small>
      </div>
    </>
  )
}
