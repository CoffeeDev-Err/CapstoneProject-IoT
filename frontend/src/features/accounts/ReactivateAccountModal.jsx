import { createPortal } from 'react-dom'
import { useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'
import SelectControl from '../../components/SelectControl'
import { formatGpsOptionLabel } from './accountPresentation'

export default function ReactivateAccountModal({
  account,
  assignedImeiToAccount,
  devices,
  onCancel,
  onConfirm,
  pending,
}) {
  const [selectedImei, setSelectedImei] = useState('')
  const cancelButtonRef = useRef(null)
  const dialogRef = useAccessibleDialog(Boolean(account), onCancel, cancelButtonRef)
  const needsDevice = account?.role !== 'Supervisor' && !account?.isMockAccount
  const availableDevices = useMemo(() => devices.filter((device) => {
    const assignedAccount = assignedImeiToAccount.get(device.imei)
    return !assignedAccount || assignedAccount.id === account?.id
  }), [account?.id, assignedImeiToAccount, devices])

  if (!account) return null
  const selectedDevice = availableDevices.find((device) => device.imei === selectedImei)
  const canConfirm = !pending && (!needsDevice || Boolean(selectedDevice))

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={pending ? undefined : onCancel}>
      <div
        ref={dialogRef}
        className="confirm-modal account-reactivate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reactivate-account-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="account-reactivate-modal__icon" aria-hidden="true"><RotateCcw /></span>
        <h3 id="reactivate-account-title" className="confirm-modal__title">Reactivate Account?</h3>
        <p className="confirm-modal__message">
          Restore access for <strong>{account.fullName || account.loginId}</strong> ({account.loginId}).
          Existing sessions will remain signed out.
        </p>

        {needsDevice && (
          <label className="account-field account-reactivate-modal__device">
            <span>Available GPS Device *</span>
            <SelectControl
              className="settings-input"
              value={selectedImei}
              onChange={(event) => setSelectedImei(event.target.value)}
              disabled={pending || availableDevices.length === 0}
            >
              <option value="">Select a registered GPS device</option>
              {availableDevices.map((device, index) => (
                <option key={device.id} value={device.imei}>
                  {formatGpsOptionLabel({ device, index, assignedAccount: null })}
                  {device.connected ? ' | Online' : ' | Offline'}
                </option>
              ))}
            </SelectControl>
            {availableDevices.length === 0 && (
              <small className="field-error">No GPS device is currently available for reassignment.</small>
            )}
          </label>
        )}

        <div className="confirm-modal__actions">
          <button ref={cancelButtonRef} type="button" className="confirm-btn confirm-btn--cancel" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-btn confirm-btn--success"
            onClick={() => onConfirm(selectedDevice || null)}
            disabled={!canConfirm}
          >
            {pending ? 'Reactivating...' : 'Reactivate Account'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
