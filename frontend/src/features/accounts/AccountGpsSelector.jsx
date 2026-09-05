import { SkeletonBlock } from '../../components/LoadingSkeleton'
import { formatGpsOptionLabel } from './accountPresentation'

function AccountGpsSelector({
  assignedImeiToAccount,
  currentAccountId,
  deviceError,
  devices,
  loading,
  hasCachedDevices = false,
  onChange,
  onRefresh,
  requiresDevice,
  selectedDeviceName,
  selectedImei,
  setupPending,
  validationError,
}) {
  return (
    <div className="account-field account-field--wide">
      <span>Registered GPS Device {requiresDevice ? '*' : '(Optional)'}</span>
      {loading && !hasCachedDevices ? (
        <div className="inline-loading-skeleton" role="status" aria-label="Loading registered GPS devices">
          <SkeletonBlock width="100%" height="2.65rem" />
          <SkeletonBlock width="6.5rem" height="2.65rem" />
        </div>
      ) : (
        <div className="account-password-row">
          <select
            className={`settings-input w-100 ${validationError ? 'settings-input--error' : ''}`}
            value={selectedImei}
            onChange={onChange}
            disabled={loading}
          >
            <option value="">
              {devices.length === 0 ? 'No GPS device registered' : 'Select a registered GPS device'}
            </option>
            {selectedImei && !devices.some((device) => device.imei === selectedImei) && (
              <option value={selectedImei}>{selectedDeviceName || 'Assigned GPS'} | Device ID: {selectedImei}</option>
            )}
            {devices.map((device, index) => {
              const assignedAccount = assignedImeiToAccount.get(device.imei)
              const assignedElsewhere = assignedAccount && assignedAccount.id !== currentAccountId
              return (
                <option key={device.id} value={device.imei} disabled={assignedElsewhere}>
                  {formatGpsOptionLabel({ device, index, assignedAccount: assignedElsewhere ? assignedAccount : null })}
                  {device.connected ? ' | Online' : ' | Offline'}
                </option>
              )
            })}
          </select>
          <button type="button" className="account-action-btn" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      )}
      {deviceError && <small className="field-error">{deviceError}</small>}
      {!loading && !deviceError && devices.length === 0 && (
        <small className="settings-hint">
          {setupPending
            ? 'Register the GPS tracker in Flespi after its SIM is active, then refresh this list to continue.'
            : 'No registered GPS device is available. Register a device in Flespi, then refresh this list.'}
        </small>
      )}
      {validationError && <small className="field-error">{validationError}</small>}
    </div>
  )
}

export default AccountGpsSelector
