/**
 * SettingsPage.jsx — System Configuration
 *
 * Provides UI controls for adjusting key system parameters.
 * Includes a supervisor-only account provisioning form so mobile users
 * do not need an in-app signup flow.
 */
import { useMemo, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'

const roles = ['Officer', 'Supervisor', 'Dispatcher']
const trackingModes = ['On-duty only', 'Always on', 'Manual enable']
const statusOptions = ['Active', 'Inactive']
const rankOptions = [
  'Police Officer I',
  'Police Officer II',
  'Police Corporal',
  'Police Staff Sergeant',
  'Police Lieutenant',
]
const unitOptions = ['Cabagan Municipal Station', 'Barangay Patrol Unit', 'Checkpoint Unit']

const initialCreatedAccounts = [
  {
    id: 'ACC-0001',
    fullName: 'Mon Maguas',
    badgeNumber: 'PC-001',
    imei: '356938035643809',
    rank: 'Police Corporal',
    role: 'Officer',
    unit: 'Cabagan Municipal Station',
    loginId: 'mon.maguas',
    temporaryPassword: 'Tmp@Mon001!',
    mobileNumber: '09171234567',
    accountStatus: 'Active',
    trackingMode: 'On-duty only',
    gpsUpdateIntervalSec: '5',
    emergencyContactName: 'Liza Maguas',
    emergencyContactNumber: '09179998888',
    forcePasswordReset: true,
    createdAt: '2026-03-21T08:30:00.000Z',
  },
  {
    id: 'ACC-0002',
    fullName: 'GerryBoy Aggabao',
    badgeNumber: 'PSS-002',
    imei: '352099001761481',
    rank: 'Police Staff Sergeant',
    role: 'Officer',
    unit: 'Cabagan Municipal Station',
    loginId: 'gerryboy.aggabao',
    temporaryPassword: 'Tmp@Gerry002!',
    mobileNumber: '09175556666',
    accountStatus: 'Active',
    trackingMode: 'On-duty only',
    gpsUpdateIntervalSec: '5',
    emergencyContactName: 'Maria Aggabao',
    emergencyContactNumber: '09173334444',
    forcePasswordReset: true,
    createdAt: '2026-03-22T09:15:00.000Z',
  },
]

const createTempPassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?'
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]
  }

  return value
}

const initialFormState = {
  fullName: '',
  badgeNumber: '',
  imei: '',
  rank: rankOptions[0],
  role: 'Officer',
  unit: unitOptions[0],
  loginId: '',
  temporaryPassword: createTempPassword(),
  mobileNumber: '',
  accountStatus: 'Active',
  trackingMode: trackingModes[0],
  gpsUpdateIntervalSec: '5',
  emergencyContactName: '',
  emergencyContactNumber: '',
  forcePasswordReset: true,
}

const formatDateTime = (isoValue) => {
  if (!isoValue) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoValue))
}

function SettingsPage() {
  const [accountForm, setAccountForm] = useState(initialFormState)
  const [createdAccounts, setCreatedAccounts] = useState(initialCreatedAccounts)
  const [accountSearch, setAccountSearch] = useState('')
  const [editingAccountId, setEditingAccountId] = useState(null)
  const [activeAccountView, setActiveAccountView] = useState('create')
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [formMessage, setFormMessage] = useState('')
  const [formMessageKind, setFormMessageKind] = useState('success')

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase()

    if (!query) {
      return createdAccounts
    }

    const tokens = query.split(/\s+/).filter(Boolean)

    return createdAccounts.filter((account) => {
      const searchableText = [
        account.fullName,
        account.rank,
        account.badgeNumber,
        account.imei,
        account.role,
        account.loginId,
        account.accountStatus,
        account.unit,
        account.mobileNumber,
      ]
        .join(' ')
        .toLowerCase()

      return tokens.every((token) => searchableText.includes(token))
    })
  }, [accountSearch, createdAccounts])

  const handleFieldChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value

    setAccountForm((prev) => ({
      ...prev,
      [field]: value,
    }))

    setFormErrors((prev) => {
      if (!prev[field]) {
        return prev
      }

      const nextErrors = { ...prev }
      delete nextErrors[field]
      return nextErrors
    })
  }

  const validateAccountForm = () => {
    const errors = {}

    if (!accountForm.fullName.trim()) {
      errors.fullName = 'Full name is required.'
    }

    if (!accountForm.badgeNumber.trim()) {
      errors.badgeNumber = 'Badge number is required.'
    }

    if (!accountForm.imei.trim()) {
      errors.imei = 'GPS IMEI is required.'
    } else if (!/^\d{15}$/.test(accountForm.imei.trim())) {
      errors.imei = 'IMEI must be exactly 15 digits.'
    }

    const duplicateBadge = createdAccounts.some(
      (account) => (
        account.id !== editingAccountId
        && account.badgeNumber.toLowerCase() === accountForm.badgeNumber.trim().toLowerCase()
      )
    )
    if (duplicateBadge) {
      errors.badgeNumber = 'Badge number already exists.'
    }

    const duplicateImei = createdAccounts.some(
      (account) => account.id !== editingAccountId && account.imei === accountForm.imei.trim()
    )
    if (duplicateImei) {
      errors.imei = 'IMEI is already assigned to another personnel account.'
    }

    if (!accountForm.loginId.trim()) {
      errors.loginId = 'Username or official email is required.'
    }

    const duplicateLogin = createdAccounts.some(
      (account) => (
        account.id !== editingAccountId
        && account.loginId.toLowerCase() === accountForm.loginId.trim().toLowerCase()
      )
    )
    if (duplicateLogin) {
      errors.loginId = 'Username or official email already exists.'
    }

    const passwordValue = accountForm.temporaryPassword
    const passwordRulesPassed =
      passwordValue.length >= 10
      && /[A-Z]/.test(passwordValue)
      && /[a-z]/.test(passwordValue)
      && /\d/.test(passwordValue)
      && /[^A-Za-z0-9]/.test(passwordValue)

    if (!passwordRulesPassed) {
      errors.temporaryPassword = 'Use at least 10 chars with upper, lower, number, and symbol.'
    }

    const gpsInterval = Number(accountForm.gpsUpdateIntervalSec)
    if (!Number.isFinite(gpsInterval) || gpsInterval < 3 || gpsInterval > 60) {
      errors.gpsUpdateIntervalSec = 'GPS interval must be between 3 and 60 seconds.'
    }

    if (accountForm.mobileNumber.trim() && !/^\+?\d{10,14}$/.test(accountForm.mobileNumber.trim())) {
      errors.mobileNumber = 'Use 10-14 digits, optional + prefix.'
    }

    if (accountForm.emergencyContactNumber.trim() && !/^\+?\d{10,14}$/.test(accountForm.emergencyContactNumber.trim())) {
      errors.emergencyContactNumber = 'Use 10-14 digits, optional + prefix.'
    }

    return errors
  }

  const handleGenerateTemporaryPassword = () => {
    setAccountForm((prev) => ({
      ...prev,
      temporaryPassword: createTempPassword(),
    }))
  }

  const resetFormToCreate = () => {
    setEditingAccountId(null)
    setAccountForm({
      ...initialFormState,
      temporaryPassword: createTempPassword(),
      rank: accountForm.rank,
      unit: accountForm.unit,
      role: accountForm.role,
      accountStatus: accountForm.accountStatus,
      trackingMode: accountForm.trackingMode,
      gpsUpdateIntervalSec: accountForm.gpsUpdateIntervalSec,
      forcePasswordReset: accountForm.forcePasswordReset,
    })
    setFormErrors({})
  }

  const handleEditAccount = (accountId) => {
    const account = createdAccounts.find((item) => item.id === accountId)

    if (!account) {
      return
    }

    setEditingAccountId(accountId)
    setActiveAccountView('create')
    setAccountForm({
      fullName: account.fullName ?? '',
      badgeNumber: account.badgeNumber ?? '',
      imei: account.imei ?? '',
      rank: account.rank ?? rankOptions[0],
      role: account.role ?? 'Officer',
      unit: account.unit ?? unitOptions[0],
      loginId: account.loginId ?? '',
      temporaryPassword: account.temporaryPassword ?? createTempPassword(),
      mobileNumber: account.mobileNumber ?? '',
      accountStatus: account.accountStatus ?? 'Active',
      trackingMode: account.trackingMode ?? trackingModes[0],
      gpsUpdateIntervalSec: account.gpsUpdateIntervalSec ?? '5',
      emergencyContactName: account.emergencyContactName ?? '',
      emergencyContactNumber: account.emergencyContactNumber ?? '',

      forcePasswordReset: account.forcePasswordReset ?? true,
    })
    setFormErrors({})
    setFormMessage(`Editing ${account.fullName}. Update details then click Save Changes.`)
    setFormMessageKind('success')
  }

  const handleDeleteAccount = (accountId) => {
    const account = createdAccounts.find((item) => item.id === accountId)

    if (!account) {
      return
    }

    setPendingDeleteAccount(account)
  }

  const handleConfirmDeleteAccount = () => {
    if (!pendingDeleteAccount) {
      return
    }

    const account = pendingDeleteAccount
    setPendingDeleteAccount(null)

    setCreatedAccounts((prev) => prev.filter((item) => item.id !== account.id))

    if (editingAccountId === account.id) {
      resetFormToCreate()
    }

    setFormMessage(`${account.fullName} account deleted.`)
    setFormMessageKind('success')
  }

  const handleCancelDeleteAccount = () => {
    setPendingDeleteAccount(null)
  }

  const handleSubmitAccount = (event) => {
    event.preventDefault()

    const errors = validateAccountForm()
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      setFormMessage('Please correct the highlighted account fields.')
      setFormMessageKind('error')
      return
    }

    const timestamp = new Date().toISOString()
    const normalizedPayload = {
      fullName: accountForm.fullName.trim(),
      badgeNumber: accountForm.badgeNumber.trim(),
      imei: accountForm.imei.trim(),
      rank: accountForm.rank,
      role: accountForm.role,
      unit: accountForm.unit,
      loginId: accountForm.loginId.trim(),
      temporaryPassword: accountForm.temporaryPassword,
      mobileNumber: accountForm.mobileNumber.trim(),
      accountStatus: accountForm.accountStatus,
      trackingMode: accountForm.trackingMode,
      gpsUpdateIntervalSec: accountForm.gpsUpdateIntervalSec,
      emergencyContactName: accountForm.emergencyContactName.trim(),
      emergencyContactNumber: accountForm.emergencyContactNumber.trim(),
      forcePasswordReset: accountForm.forcePasswordReset,
    }

    if (editingAccountId) {
      setCreatedAccounts((prev) => prev.map((account) => {
        if (account.id !== editingAccountId) {
          return account
        }

        return {
          ...account,
          ...normalizedPayload,
          updatedAt: timestamp,
        }
      }))
      setFormMessage(`${normalizedPayload.fullName} account updated successfully.`)
      setFormMessageKind('success')
    } else {
      const nextNumericId = createdAccounts.reduce((maxValue, account) => {
        const matched = /^ACC-(\d+)$/.exec(account.id)
        if (!matched) {
          return maxValue
        }

        return Math.max(maxValue, Number(matched[1]))
      }, 0) + 1

      const newAccount = {
        id: `ACC-${String(nextNumericId).padStart(4, '0')}`,
        ...normalizedPayload,
        createdAt: timestamp,
      }

      setCreatedAccounts((prev) => [newAccount, ...prev])
      setFormMessage(
        `${newAccount.fullName} account created successfully. Temporary password issued for first login.`
      )
      setFormMessageKind('success')
    }

    resetFormToCreate()
    setActiveAccountView('manage')
  }

  return (
    <div className="page-container page-container--settings fade-in p-3 p-md-4">
      <header className="page-header mb-4">
        <h2 className="page-title">Account Management</h2>
        <p className="page-subtitle">Create and manage officer mobile accounts</p>
      </header>

      <div className="settings-grid row g-3 mx-0">
        <div className="col-12">
          <div className="widget-card slide-up account-management-card">
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
              <div>
                <h3 className="widget-title mb-1">Account Management (Supervisor Only)</h3>
                <p className="settings-hint mb-0">
                  Create mobile login accounts for officers. Signup remains disabled on mobile for security.
                </p>
              </div>
            </div>

            <div className="account-view-nav mb-3" role="tablist" aria-label="Account management views">
              <button
                type="button"
                role="tab"
                aria-selected={activeAccountView === 'create'}
                className={`account-view-tab ${activeAccountView === 'create' ? 'account-view-tab--active' : ''}`}
                onClick={() => setActiveAccountView('create')}
              >
                Create Account
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeAccountView === 'manage'}
                className={`account-view-tab ${activeAccountView === 'manage' ? 'account-view-tab--active' : ''}`}
                onClick={() => setActiveAccountView('manage')}
              >
                Manage Accounts
              </button>
            </div>

            {formMessage && (
              <p
                className={`account-feedback account-feedback--inline mb-3 ${formMessageKind === 'error' ? 'account-feedback--error' : ''}`}
                role="status"
              >
                {formMessage}
              </p>
            )}

            {activeAccountView === 'create' && (
              <div className="account-create-section">
                <form className="account-form account-form--fixed" onSubmit={handleSubmitAccount}>
                  <div className="account-form-grid">
                <label className="account-field">
                  <span>Full Name *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.fullName ? 'settings-input--error' : ''}`}
                    value={accountForm.fullName}
                    onChange={handleFieldChange('fullName')}
                    placeholder="Enter full legal name"
                  />
                  {formErrors.fullName && <small className="field-error">{formErrors.fullName}</small>}
                </label>

                <label className="account-field">
                  <span>Badge Number *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.badgeNumber ? 'settings-input--error' : ''}`}
                    value={accountForm.badgeNumber}
                    onChange={handleFieldChange('badgeNumber')}
                    placeholder="e.g., PC-104"
                  />
                  {formErrors.badgeNumber && <small className="field-error">{formErrors.badgeNumber}</small>}
                </label>

                    <label className="account-field">
                      <span>GPS Device IMEI *</span>
                      <input
                        className={`settings-input w-100 ${formErrors.imei ? 'settings-input--error' : ''}`}
                        value={accountForm.imei}
                        onChange={handleFieldChange('imei')}
                        placeholder="15-digit device IMEI"
                        inputMode="numeric"
                        maxLength={15}
                      />
                      {formErrors.imei && <small className="field-error">{formErrors.imei}</small>}
                    </label>

                <label className="account-field">
                  <span>Rank *</span>
                  <select className="settings-input w-100" value={accountForm.rank} onChange={handleFieldChange('rank')}>
                    {rankOptions.map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="account-field">
                  <span>Role *</span>
                  <select className="settings-input w-100" value={accountForm.role} onChange={handleFieldChange('role')}>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="account-field">
                  <span>Unit / Station *</span>
                  <select className="settings-input w-100" value={accountForm.unit} onChange={handleFieldChange('unit')}>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="account-field">
                  <span>Account Status *</span>
                  <select
                    className="settings-input w-100"
                    value={accountForm.accountStatus}
                    onChange={handleFieldChange('accountStatus')}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="account-field account-field--wide">
                  <span>Username or Official Email *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.loginId ? 'settings-input--error' : ''}`}
                    value={accountForm.loginId}
                    onChange={handleFieldChange('loginId')}
                    placeholder="e.g., juan.delacruz or juan.delacruz@pnp.gov.ph"
                  />
                  {formErrors.loginId && <small className="field-error">{formErrors.loginId}</small>}
                </label>

                <div className="account-field">
                  <span>Temporary Password *</span>
                  <div className="account-password-row">
                    <input
                      className={`settings-input w-100 ${formErrors.temporaryPassword ? 'settings-input--error' : ''}`}
                      value={accountForm.temporaryPassword}
                      onChange={handleFieldChange('temporaryPassword')}
                    />
                    <button type="button" className="account-action-btn" onClick={handleGenerateTemporaryPassword}>
                      Regenerate
                    </button>
                  </div>
                  {formErrors.temporaryPassword && (
                    <small className="field-error">{formErrors.temporaryPassword}</small>
                  )}
                </div>

                <label className="account-field">
                  <span>Mobile Number</span>
                  <input
                    className={`settings-input w-100 ${formErrors.mobileNumber ? 'settings-input--error' : ''}`}
                    value={accountForm.mobileNumber}
                    onChange={handleFieldChange('mobileNumber')}
                    placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                  />
                  {formErrors.mobileNumber && <small className="field-error">{formErrors.mobileNumber}</small>}
                </label>

                <label className="account-field">
                  <span>Tracking Mode</span>
                  <select
                    className="settings-input w-100"
                    value={accountForm.trackingMode}
                    onChange={handleFieldChange('trackingMode')}
                  >
                    {trackingModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="account-field">
                  <span>GPS Update Interval (sec) *</span>
                  <input
                    type="number"
                    min="3"
                    max="60"
                    className={`settings-input w-100 ${formErrors.gpsUpdateIntervalSec ? 'settings-input--error' : ''}`}
                    value={accountForm.gpsUpdateIntervalSec}
                    onChange={handleFieldChange('gpsUpdateIntervalSec')}
                  />
                  {formErrors.gpsUpdateIntervalSec && (
                    <small className="field-error">{formErrors.gpsUpdateIntervalSec}</small>
                  )}
                </label>

                <label className="account-field">
                  <span>Emergency Contact Name</span>
                  <input
                    className="settings-input w-100"
                    value={accountForm.emergencyContactName}
                    onChange={handleFieldChange('emergencyContactName')}
                    placeholder="Name of contact person"
                  />
                </label>

                <label className="account-field">
                  <span>Emergency Contact Number</span>
                  <input
                    className={`settings-input w-100 ${formErrors.emergencyContactNumber ? 'settings-input--error' : ''}`}
                    value={accountForm.emergencyContactNumber}
                    onChange={handleFieldChange('emergencyContactNumber')}
                    placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                  />
                  {formErrors.emergencyContactNumber && (
                    <small className="field-error">{formErrors.emergencyContactNumber}</small>
                  )}
                </label>
                  </div>

                  <label className="account-checkbox-row">
                    <input
                      type="checkbox"
                      checked={accountForm.forcePasswordReset}
                      onChange={handleFieldChange('forcePasswordReset')}
                    />
                    <span>Force password reset on first mobile login</span>
                  </label>

                  <div className="account-form-actions">
                    <button type="submit" className="account-submit-btn">
                      {editingAccountId ? 'Save Changes' : 'Create Account'}
                    </button>
                    {editingAccountId && (
                      <button
                        type="button"
                        className="account-action-btn"
                        onClick={resetFormToCreate}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {activeAccountView === 'manage' && (
              <div className="account-table-section account-table-section--standalone">
                <h4 className="settings-label mb-2">Recently Provisioned Accounts</h4>
                <div className="account-table-toolbar">
                  <small className="settings-hint account-table-meta">
                    {filteredAccounts.length} of {createdAccounts.length} account(s)
                  </small>
                  <input
                    type="search"
                    className="settings-input account-table-search"
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="Search name, rank, badge, IMEI, role, or login"
                    aria-label="Search provisioned accounts"
                  />
                </div>

                <div className="account-table-wrap">
                  <table className="personnel-table table align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Rank</th>
                        <th>Badge</th>
                        <th>IMEI</th>
                        <th>Role</th>
                        <th>Login ID</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.length === 0 ? (
                        <tr className="personnel-row">
                          <td colSpan={9} className="text-body-secondary small">
                            No account matched your search.
                          </td>
                        </tr>
                      ) : (
                        filteredAccounts.map((account) => (
                          <tr key={account.id} className="personnel-row">
                            <td>{account.fullName}</td>
                            <td>{account.rank}</td>
                            <td className="personnel-badge">{account.badgeNumber}</td>
                            <td className="personnel-badge">{account.imei}</td>
                            <td>{account.role}</td>
                            <td>{account.loginId}</td>
                            <td>
                              <span
                                className="status-badge"
                                style={{ '--status-color': account.accountStatus === 'Active' ? '#16a34a' : '#64748b' }}
                              >
                                {account.accountStatus}
                              </span>
                            </td>
                            <td>{formatDateTime(account.createdAt)}</td>
                            <td className="account-table-actions">
                              <button
                                type="button"
                                className="account-table-btn account-table-btn--edit"
                                onClick={() => handleEditAccount(account.id)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="account-table-btn account-table-btn--delete"
                                onClick={() => handleDeleteAccount(account.id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingDeleteAccount)}
        title="Delete Account?"
        message={pendingDeleteAccount
          ? `Delete account for ${pendingDeleteAccount.fullName}? This action cannot be undone.`
          : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteAccount}
        onCancel={handleCancelDeleteAccount}
      />
    </div>
  )
}

export default SettingsPage
