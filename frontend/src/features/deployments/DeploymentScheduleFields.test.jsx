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

  it('uses a custom picker without native datetime segments and emits named updates', () => {
    const onChange = vi.fn()
    const { container } = render(
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
    expect(start).toHaveTextContent('28/08/2026 9:00 AM')
    expect(container.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument()

    fireEvent.click(start)
    expect(screen.getByRole('dialog', { name: 'Scheduled deployment start date and time' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose August 29, 2026' }))
    expect(onChange).toHaveBeenCalledWith('shiftStart', '2026-08-29T09:00')

    fireEvent.change(screen.getByLabelText('Scheduled deployment start date and time hour'), {
      target: { value: '11' },
    })
    expect(onChange).toHaveBeenCalledWith('shiftStart', '2026-08-28T11:00')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Scheduled deployment start date and time' })).not.toBeInTheDocument()
    expect(start).toHaveFocus()
  })
})
