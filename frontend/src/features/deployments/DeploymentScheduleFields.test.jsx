import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEPLOYMENT_MODES } from './deploymentForm'
import { DeploymentScheduleFields, DeploymentTimingSelector } from './DeploymentScheduleFields'

describe('deployment schedule controls', () => {
  it('reports timing-mode changes without owning page state', () => {
    const onChange = vi.fn()
    render(
      <DeploymentTimingSelector
        disabled={false}
        mode={DEPLOYMENT_MODES.START_NOW}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('radio', { name: /schedule for later/i }))
    expect(onChange).toHaveBeenCalledWith(DEPLOYMENT_MODES.SCHEDULE_LATER)
    expect(screen.getByText(/becomes on duty immediately/i)).toBeInTheDocument()
  })

  it('preserves field-level validation and emits named updates', () => {
    const onChange = vi.fn()
    render(
      <DeploymentScheduleFields
        maximumShiftEnd="2026-08-29T08:00"
        minimumShiftEnd="2026-08-28T10:00"
        minimumShiftStart="2026-08-28T09:00"
        mode={DEPLOYMENT_MODES.SCHEDULE_LATER}
        onChange={onChange}
        shiftEnd="2026-08-28T17:00"
        shiftEndHint="End after the start."
        shiftStart="2026-08-28T09:00"
        shiftStartHint="Choose a future start."
        shiftEndInvalid={false}
        shiftStartInvalid
      />
    )

    const start = screen.getByLabelText('Scheduled deployment start date and time')
    expect(start).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(start, { target: { value: '2026-08-28T11:00' } })
    expect(onChange).toHaveBeenCalledWith('shiftStart', '2026-08-28T11:00')
  })
})
