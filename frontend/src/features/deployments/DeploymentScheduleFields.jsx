import {
  DEPLOYMENT_MODES,
  formatDateTimePreview,
  openDateTimePicker,
} from './deploymentForm'

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
  return (
    <>
      <div className="assignment-field assignment-field--start">
        <span>{mode === DEPLOYMENT_MODES.SCHEDULE_LATER ? 'Scheduled Start *' : 'Shift Start *'}</span>
        <input type="datetime-local" className="settings-input w-100 assignment-datetime-input"
          value={shiftStart} onChange={(event) => onChange('shiftStart', event.target.value)}
          onClick={openDateTimePicker} min={minimumShiftStart} step="60"
          aria-label={mode === DEPLOYMENT_MODES.SCHEDULE_LATER
            ? 'Scheduled deployment start date and time' : 'Deployment shift start date and time'}
          title="Click anywhere in this field to open the date and time picker"
          aria-describedby="assignment-shift-start-hint" aria-invalid={shiftStartInvalid} required />
        <small className="assignment-field__datetime-preview">{formatDateTimePreview(shiftStart)}</small>
        <small id="assignment-shift-start-hint"
          className={`assignment-field__hint${shiftStartInvalid ? ' is-error' : ''}`}>{shiftStartHint}</small>
      </div>
      <div className="assignment-field assignment-field--end">
        <span>Shift End *</span>
        <input type="datetime-local" className="settings-input w-100 assignment-datetime-input"
          value={shiftEnd} onChange={(event) => onChange('shiftEnd', event.target.value)}
          onClick={openDateTimePicker} min={minimumShiftEnd} max={maximumShiftEnd} step="60"
          aria-label="Deployment shift end date and time"
          title="Click anywhere in this field to open the date and time picker"
          aria-describedby="assignment-shift-end-hint" aria-invalid={shiftEndInvalid} required />
        <small className="assignment-field__datetime-preview">{formatDateTimePreview(shiftEnd)}</small>
        <small id="assignment-shift-end-hint"
          className={`assignment-field__hint${shiftEndInvalid ? ' is-error' : ''}`}>{shiftEndHint}</small>
      </div>
    </>
  )
}
