import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccountGpsSelector from './AccountGpsSelector'

describe('AccountGpsSelector', () => {
  it('prevents selecting a tracker assigned to another account and refreshes on demand', () => {
    const onRefresh = vi.fn()
    render(
      <AccountGpsSelector
        assignedImeiToAccount={new Map([['860000000000002', { id: 'account-2', fullName: 'Officer Two' }]])}
        currentAccountId="account-1"
        deviceError=""
        devices={[
          { id: 'gps-1', imei: '860000000000001', name: 'Patrol GPS 1', connected: true },
          { id: 'gps-2', imei: '860000000000002', name: 'Patrol GPS 2', connected: false },
        ]}
        loading={false}
        onChange={vi.fn()}
        onRefresh={onRefresh}
        requiresDevice
        selectedDeviceName=""
        selectedImei=""
        setupPending={false}
        validationError=""
      />
    )

    expect(screen.getByRole('option', { name: /gps-002/i })).toBeDisabled()
    expect(screen.getByRole('option', { name: /gps-001/i })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })
})
