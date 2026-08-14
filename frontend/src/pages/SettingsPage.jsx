/**
 * SettingsPage.jsx — System Configuration
 *
 * Provides UI controls for adjusting key system parameters.
 * Includes a supervisor-only account provisioning form so mobile users
 * do not need an in-app signup flow.
 */
import { useEffect, useMemo, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'
import {
  createAccount,
  deactivateAccount,
  getAccounts,
  updateAccount,
} from '../services/accounts'
import { getRegisteredFlespiDevices } from '../services/flespiDevices'
import { resolveApiAssetUrl } from '../services/apiAssets'
import {
  ACCOUNT_FIELD_LIMITS,
  POLICE_RANKS,
  normalizeBadgeNumber,
  normalizeEmail,
  normalizeHumanName,
  normalizeLoginId,
  normalizeMobileNumber,
  validateBadgeNumber,
  validateFullName,
  validateLoginId,
  validateMobileNumber,
  validateOfficialEmail,
  validateRank,
} from '../utils/accountValidation'

const rankOptions = POLICE_RANKS

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
  flespiDeviceId: '',
  flespiDeviceName: '',
  rank: rankOptions[0],
  loginId: '',
  officialEmail: '',
  temporaryPassword: createTempPassword(),
  mobileNumber: '',
}

const getDeviceCode = (device, index = 0) => {
  const source = `${device?.deviceCode || ''} ${device?.name || ''} ${device?.flespiDeviceName || ''}`
  const match = source.match(/\bGPS[-\s]?\d{1,4}\b/i)

  if (match) {
    const digits = match[0].match(/\d+/)?.[0] || String(index + 1)
    return `GPS-${digits.padStart(3, '0')}`
  }

  return `GPS-${String(index + 1).padStart(3, '0')}`
}

const formatGpsOptionLabel = ({ device, index, assignedAccount }) => {
  const statusLabel = assignedAccount ? `Assigned to ${assignedAccount.fullName}` : 'Available'
  return `${getDeviceCode(device, index)} | Device ID: ${device.imei} | ${statusLabel}`
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
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const [createdAccounts, setCreatedAccounts] = useState([])
  const [accountSearch, setAccountSearch] = useState('')
  const [editingAccountId, setEditingAccountId] = useState(null)
  const [activeAccountView, setActiveAccountView] = useState('create')
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [formMessage, setFormMessage] = useState('')
  const [formMessageKind, setFormMessageKind] = useState('success')
  const [flespiDevices, setFlespiDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [devicesError, setDevicesError] = useState('')
  const [devicesSetupPending, setDevicesSetupPending] = useState(false)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountRequestPending, setAccountRequestPending] = useState(false)

  const loadAccounts = async () => {
    setAccountsLoading(true)

    try {
      setCreatedAccounts(await getAccounts())
    } catch {
      setFormMessage('Accounts could not be loaded from the database. Check the backend connection.')
      setFormMessageKind('error')
    } finally {
      setAccountsLoading(false)
    }
  }

  const loadFlespiDevices = async ({ refresh = false } = {}) => {
    setDevicesLoading(true)
    setDevicesError('')
    setDevicesSetupPending(false)

    try {
      const devices = await getRegisteredFlespiDevices({ refresh })
      setFlespiDevices(devices)
    } catch (error) {
      setFlespiDevices([])
      if (error.code === 'FLESPI_NOT_CONFIGURED') {
        setDevicesSetupPending(true)
      } else {
        setDevicesError('GPS devices could not be loaded. Check the connection, then refresh.')
      }
    } finally {
      setDevicesLoading(false)
    }
  }

  useEffect(() => {
    loadFlespiDevices()
    loadAccounts()
  }, [])

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
        account.flespiDeviceName,
        account.loginId,
        account.officialEmail,
        account.accountStatus,
        account.mobileNumber,
      ]
        .join(' ')
        .toLowerCase()

      return tokens.every((token) => searchableText.includes(token))
    })
  }, [accountSearch, createdAccounts])

  const assignedImeiToAccount = useMemo(
    () => new Map(createdAccounts.filter((account) => account.imei).map((account) => [account.imei, account])),
    [createdAccounts]
  )

  const editingAccount = useMemo(
    () => createdAccounts.find((account) => account.id === editingAccountId) || null,
    [createdAccounts, editingAccountId]
  )
  const isEditingSupervisor = editingAccount?.role === 'Supervisor'
  const isEditingMockAccount = Boolean(editingAccount?.isMockAccount)
  const requiresGpsDevice = !isEditingSupervisor && !isEditingMockAccount

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

  const handleDeviceChange = (event) => {
    const imei = event.target.value
    const device = flespiDevices.find((item) => item.imei === imei)

    setAccountForm((prev) => ({
      ...prev,
      imei,
      flespiDeviceId: device?.id || '',
      flespiDeviceName: device?.name || '',
    }))

    setFormErrors((prev) => {
      if (!prev.imei) return prev
      const nextErrors = { ...prev }
      delete nextErrors.imei
      return nextErrors
    })
  }

  const handleFieldBlur = (field) => () => {
    const nextError = validateAccountForm()[field]
    setFormErrors((prev) => {
      const nextErrors = { ...prev }
      if (nextError) nextErrors[field] = nextError
      else delete nextErrors[field]
      return nextErrors
    })
  }

  const handleProfilePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!supportedTypes.includes(file.type)) {
      setProfilePhoto(null)
      setFormErrors((prev) => ({ ...prev, profilePhoto: 'Use a JPEG, PNG, or WebP image.' }))
      event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfilePhoto(null)
      setFormErrors((prev) => ({ ...prev, profilePhoto: 'Profile photo must be 5 MB or smaller.' }))
      event.target.value = ''
      return
    }

    setProfilePhoto(file)
    setFormErrors((prev) => {
      const nextErrors = { ...prev }
      delete nextErrors.profilePhoto
      return nextErrors
    })
    const reader = new FileReader()
    reader.onload = () => setProfilePhotoPreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const validateAccountForm = () => {
    const errors = {}

    if (!isEditingSupervisor) {
      const fullNameError = validateFullName(accountForm.fullName)
      const badgeNumberError = validateBadgeNumber(accountForm.badgeNumber)
      const rankError = validateRank(accountForm.rank)
      const mobileNumberError = validateMobileNumber(accountForm.mobileNumber)
      if (fullNameError) errors.fullName = fullNameError
      if (badgeNumberError) errors.badgeNumber = badgeNumberError
      if (rankError) errors.rank = rankError
      if (mobileNumberError) errors.mobileNumber = mobileNumberError

      if (requiresGpsDevice && !accountForm.imei.trim()) {
        errors.imei = 'GPS device ID is required.'
      } else if (accountForm.imei.trim() && !flespiDevices.some((device) => device.imei === accountForm.imei)) {
        errors.imei = 'Select a device ID registered in Flespi.'
      }

      const duplicateBadge = createdAccounts.some(
        (account) => (
          account.id !== editingAccountId
          && account.badgeNumber.toLowerCase() === accountForm.badgeNumber.trim().toLowerCase()
        )
      )
      if (!errors.badgeNumber && duplicateBadge) {
        errors.badgeNumber = 'Badge number already exists.'
      }

      const duplicateImei = accountForm.imei.trim() && createdAccounts.some(
        (account) => account.id !== editingAccountId && account.imei === accountForm.imei.trim()
      )
      if (duplicateImei) {
        errors.imei = 'Device ID is already assigned to another personnel account.'
      }
    }

    const loginIdError = validateLoginId(accountForm.loginId, {
      accountType: isEditingSupervisor ? 'supervisor' : 'officer',
      existingLoginId: editingAccount?.loginId || '',
    })
    if (loginIdError) errors.loginId = loginIdError

    const duplicateLogin = createdAccounts.some(
      (account) => (
        account.id !== editingAccountId
        && account.loginId.toLowerCase() === accountForm.loginId.trim().toLowerCase()
      )
    )
    if (!errors.loginId && duplicateLogin) {
      errors.loginId = 'Login ID already exists.'
    }

    const normalizedEmail = normalizeEmail(accountForm.officialEmail)
    const emailError = validateOfficialEmail(normalizedEmail)
    if (emailError) errors.officialEmail = emailError

    const duplicateEmail = createdAccounts.some(
      (account) => (
        account.id !== editingAccountId
        && account.officialEmail?.toLowerCase() === normalizedEmail
      )
    )
    if (!errors.officialEmail && duplicateEmail) {
      errors.officialEmail = 'Official email already belongs to another account.'
    }

    const passwordValue = accountForm.temporaryPassword
    const passwordRulesPassed =
      passwordValue.length >= 10
      && passwordValue.length <= ACCOUNT_FIELD_LIMITS.password
      && /[A-Z]/.test(passwordValue)
      && /[a-z]/.test(passwordValue)
      && /\d/.test(passwordValue)
      && /[^A-Za-z0-9]/.test(passwordValue)

    if ((!editingAccountId || passwordValue) && !passwordRulesPassed) {
      errors.temporaryPassword = `Use 10-${ACCOUNT_FIELD_LIMITS.password} characters, including an uppercase letter, lowercase letter, number, and symbol.`
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
    })
    setFormErrors({})
    setProfilePhoto(null)
    setProfilePhotoPreview('')
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
      flespiDeviceId: account.flespiDeviceId ?? '',
      flespiDeviceName: account.flespiDeviceName ?? '',
      rank: account.rank ?? rankOptions[0],
      loginId: account.loginId ?? '',
      officialEmail: account.officialEmail ?? '',
      temporaryPassword: '',
      mobileNumber: account.mobileNumber ?? '',
    })
    setProfilePhoto(null)
    setProfilePhotoPreview(resolveApiAssetUrl(account.photoUrl))
    setFormErrors({})
    const accountLabel = account.fullName || account.loginId
    setFormMessage(`Editing ${accountLabel}. Update details then click Save Changes.`)
    setFormMessageKind('success')
  }

  const handleDeleteAccount = (accountId) => {
    const account = createdAccounts.find((item) => item.id === accountId)

    if (!account) {
      return
    }

    setPendingDeleteAccount(account)
  }

  const handleConfirmDeleteAccount = async () => {
    if (!pendingDeleteAccount) {
      return
    }

    const account = pendingDeleteAccount
    setPendingDeleteAccount(null)
    setAccountRequestPending(true)

    try {
      await deactivateAccount(account.id)
      setCreatedAccounts((prev) => prev.map((item) => (
        item.id === account.id
          ? { ...item, accountStatus: 'Inactive', imei: '', flespiDeviceId: '', flespiDeviceName: '' }
          : item
      )))

      if (editingAccountId === account.id) {
        resetFormToCreate()
      }

      const accountLabel = account.fullName || account.loginId
      setFormMessage(
        account.role === 'Supervisor'
          ? `${accountLabel} account deactivated.`
          : `${accountLabel} account deactivated and its GPS device was released.`
      )
      setFormMessageKind('success')
    } catch (error) {
      setFormMessage(error.message)
      setFormMessageKind('error')
    } finally {
      setAccountRequestPending(false)
    }
  }

  const handleCancelDeleteAccount = () => {
    setPendingDeleteAccount(null)
  }

  const handleSubmitAccount = async (event) => {
    event.preventDefault()

    const errors = validateAccountForm()
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      setFormMessage('Please correct the highlighted account fields.')
      setFormMessageKind('error')
      return
    }

    const normalizedPayload = isEditingSupervisor
      ? {
          loginId: normalizeLoginId(accountForm.loginId),
          officialEmail: normalizeEmail(accountForm.officialEmail),
          temporaryPassword: accountForm.temporaryPassword,
          accountStatus: editingAccount?.accountStatus || 'Active',
        }
      : {
          fullName: normalizeHumanName(accountForm.fullName),
          badgeNumber: normalizeBadgeNumber(accountForm.badgeNumber),
          imei: accountForm.imei.trim(),
          flespiDeviceId: accountForm.flespiDeviceId,
          flespiDeviceName: accountForm.flespiDeviceName,
          rank: accountForm.rank,
          role: 'Officer',
          loginId: normalizeLoginId(accountForm.loginId),
          officialEmail: normalizeEmail(accountForm.officialEmail),
          temporaryPassword: accountForm.temporaryPassword,
          mobileNumber: normalizeMobileNumber(accountForm.mobileNumber),
          accountStatus: 'Active',
          forcePasswordReset: true,
        }

    setAccountRequestPending(true)

    try {
      if (editingAccountId) {
        const updatedAccount = await updateAccount(editingAccountId, normalizedPayload, profilePhoto)
        setCreatedAccounts((prev) => prev.map((account) => (
          account.id === editingAccountId ? updatedAccount : account
        )))
        setFormMessage(`${updatedAccount.fullName || updatedAccount.loginId} account updated successfully.`)
      } else {
        const newAccount = await createAccount(normalizedPayload, profilePhoto)
        setCreatedAccounts((prev) => [newAccount, ...prev])
        setFormMessage(
          `${newAccount.fullName} account created successfully. Temporary password issued for first login.`
        )
      }
      setFormMessageKind('success')
      window.dispatchEvent(new Event('bantaycabagan:account-updated'))
      resetFormToCreate()
      setActiveAccountView('manage')
    } catch (error) {
      if (error.field) {
        const fieldMap = {
          username: 'loginId',
          email: 'officialEmail',
          fullName: 'fullName',
          badgeNumber: 'badgeNumber',
          imei: 'imei',
          personnelId: 'badgeNumber',
          loginId: 'loginId',
          officialEmail: 'officialEmail',
          rank: 'rank',
          mobileNumber: 'mobileNumber',
          temporaryPassword: 'temporaryPassword',
        }
        const formField = fieldMap[error.field]
        if (formField) setFormErrors((prev) => ({ ...prev, [formField]: error.message }))
      }
      setFormMessage(error.message)
      setFormMessageKind('error')
    } finally {
      setAccountRequestPending(false)
    }
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
                <form className="account-form account-form--fixed" onSubmit={handleSubmitAccount} noValidate>
	                  {isEditingSupervisor && (
	                    <p className="settings-hint account-role-note">
	                      Supervisor accounts are for web monitoring and administration. A badge, field rank, mobile number, and GPS device are not required.
	                    </p>
	                  )}
	                  <div className="account-form-grid">
	                <div className="account-field account-field--full account-photo-field">
	                  <span>Profile Photo</span>
	                  <div className="account-photo-actions">
	                      <label className="account-action-btn account-photo-picker">
	                        {profilePhotoPreview ? 'Change Photo' : 'Choose Photo'}
	                        <input
	                          type="file"
	                          accept="image/jpeg,image/png,image/webp"
	                          onChange={handleProfilePhotoChange}
	                        />
	                      </label>
	                      <small className="settings-hint">JPEG, PNG, or WebP. Maximum 5 MB.</small>
	                  </div>
	                  {formErrors.profilePhoto && <small className="field-error">{formErrors.profilePhoto}</small>}
	                </div>
	                {!isEditingSupervisor && (
	                  <>
	                <label className="account-field">
                  <span>Full Name *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.fullName ? 'settings-input--error' : ''}`}
                    value={accountForm.fullName}
                    onChange={handleFieldChange('fullName')}
                    onBlur={handleFieldBlur('fullName')}
                    placeholder="Enter full legal name"
                    maxLength={ACCOUNT_FIELD_LIMITS.fullName}
                    autoComplete="name"
                    aria-invalid={Boolean(formErrors.fullName)}
                  />
                  {formErrors.fullName && <small className="field-error">{formErrors.fullName}</small>}
                </label>

                <label className="account-field">
                  <span>Badge Number *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.badgeNumber ? 'settings-input--error' : ''}`}
                    value={accountForm.badgeNumber}
                    onChange={handleFieldChange('badgeNumber')}
                    onBlur={handleFieldBlur('badgeNumber')}
                    placeholder="e.g., PC-104"
                    maxLength={ACCOUNT_FIELD_LIMITS.badgeNumber}
                    autoCapitalize="characters"
                    aria-invalid={Boolean(formErrors.badgeNumber)}
                  />
                  {formErrors.badgeNumber && <small className="field-error">{formErrors.badgeNumber}</small>}
                </label>

                <label className="account-field">
	                  <span>Rank *</span>
                  <select
                    className={`settings-input w-100 ${formErrors.rank ? 'settings-input--error' : ''}`}
                    value={accountForm.rank}
                    onChange={handleFieldChange('rank')}
                    onBlur={handleFieldBlur('rank')}
                    aria-invalid={Boolean(formErrors.rank)}
                  >
                    {rankOptions.map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                  {formErrors.rank && <small className="field-error">{formErrors.rank}</small>}
	                </label>
	                  </>
	                )}

                {!isEditingSupervisor && (
                <div className="account-field account-field--wide">
                  <span>Registered GPS Device {requiresGpsDevice ? '*' : '(Optional)'}</span>
                  <div className="account-password-row">
                    <select
                      className={`settings-input w-100 ${formErrors.imei ? 'settings-input--error' : ''}`}
                      value={accountForm.imei}
                      onChange={handleDeviceChange}
                      disabled={devicesLoading}
                    >
                      <option value="">
                        {devicesLoading
                          ? 'Loading registered GPS devices...'
                          : flespiDevices.length === 0
                            ? 'No GPS device registered'
                            : 'Select a registered GPS device'}
                      </option>
                      {accountForm.imei && !flespiDevices.some((device) => device.imei === accountForm.imei) && (
                        <option value={accountForm.imei}>
                          {accountForm.flespiDeviceName || 'Assigned GPS'} | Device ID: {accountForm.imei}
                        </option>
                      )}
                      {flespiDevices.map((device, index) => {
                        const assignedAccount = assignedImeiToAccount.get(device.imei)
                        const assignedElsewhere = assignedAccount && assignedAccount.id !== editingAccountId

                        return (
                          <option key={device.id} value={device.imei} disabled={assignedElsewhere}>
                            {formatGpsOptionLabel({ device, index, assignedAccount: assignedElsewhere ? assignedAccount : null })}
                            {device.connected ? ' | Online' : ' | Offline'}
                          </option>
                        )
                      })}
                    </select>
                    <button
                      type="button"
                      className="account-action-btn"
                      onClick={() => loadFlespiDevices({ refresh: true })}
                      disabled={devicesLoading}
                    >
                      Refresh
                    </button>
                  </div>
                  {devicesError && <small className="field-error">{devicesError}</small>}
                  {!devicesLoading && !devicesError && flespiDevices.length === 0 && (
                    <small className="settings-hint">
                      {devicesSetupPending
                        ? 'Register the GPS tracker in Flespi after its SIM is active, then refresh this list to continue.'
                        : 'No registered GPS device is available. Register a device in Flespi, then refresh this list.'}
                    </small>
                  )}
                  {formErrors.imei && <small className="field-error">{formErrors.imei}</small>}
                </div>
                )}

                <label className="account-field">
                  <span>Login ID *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.loginId ? 'settings-input--error' : ''}`}
                    value={accountForm.loginId}
                    onChange={handleFieldChange('loginId')}
                    onBlur={handleFieldBlur('loginId')}
                    placeholder={isEditingSupervisor ? 'e.g., supervisor' : 'Enter 4-20 digits'}
                    inputMode={isEditingSupervisor ? 'text' : 'numeric'}
                    maxLength={ACCOUNT_FIELD_LIMITS.loginId}
                    autoComplete="username"
                    spellCheck="false"
                    aria-invalid={Boolean(formErrors.loginId)}
                  />
                  {!formErrors.loginId && !isEditingSupervisor && (
                    <small className="settings-hint">
                      {editingAccount?.loginId && !/^\d{4,20}$/.test(editingAccount.loginId)
                        ? 'Existing legacy Login ID remains valid. Use 4-20 digits if you replace it.'
                        : 'Use 4-20 digits only.'}
                    </small>
                  )}
                  {formErrors.loginId && <small className="field-error">{formErrors.loginId}</small>}
                </label>

                <label className="account-field">
                  <span>Official Email *</span>
                  <input
                    type="email"
                    className={`settings-input w-100 ${formErrors.officialEmail ? 'settings-input--error' : ''}`}
                    value={accountForm.officialEmail}
                    onChange={handleFieldChange('officialEmail')}
                    onBlur={handleFieldBlur('officialEmail')}
                    placeholder="e.g., juan.delacruz@pnp.gov.ph"
                    maxLength={ACCOUNT_FIELD_LIMITS.email}
                    autoComplete="email"
                    spellCheck="false"
                    aria-invalid={Boolean(formErrors.officialEmail)}
                  />
                  {formErrors.officialEmail && <small className="field-error">{formErrors.officialEmail}</small>}
                </label>

                <div className="account-field">
                  <span>{editingAccountId ? 'New Temporary Password' : 'Temporary Password *'}</span>
                  <div className="account-password-row">
                    <input
                      className={`settings-input w-100 ${formErrors.temporaryPassword ? 'settings-input--error' : ''}`}
                      value={accountForm.temporaryPassword}
                      onChange={handleFieldChange('temporaryPassword')}
                      onBlur={handleFieldBlur('temporaryPassword')}
                      placeholder={editingAccountId ? 'Leave blank to keep the current password' : ''}
                      maxLength={ACCOUNT_FIELD_LIMITS.password}
                      autoComplete="new-password"
                      spellCheck="false"
                      aria-invalid={Boolean(formErrors.temporaryPassword)}
                    />
                    <button type="button" className="account-action-btn" onClick={handleGenerateTemporaryPassword}>
                      Regenerate
                    </button>
                  </div>
                  {formErrors.temporaryPassword && (
                    <small className="field-error">{formErrors.temporaryPassword}</small>
                  )}
                </div>

	                {!isEditingSupervisor && (
	                  <label className="account-field">
	                    <span>Mobile Number</span>
	                    <input
	                      className={`settings-input w-100 ${formErrors.mobileNumber ? 'settings-input--error' : ''}`}
                      value={accountForm.mobileNumber}
                      onChange={handleFieldChange('mobileNumber')}
                      onBlur={handleFieldBlur('mobileNumber')}
                      placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                      inputMode="tel"
                      maxLength={18}
                      autoComplete="tel"
                      aria-invalid={Boolean(formErrors.mobileNumber)}
	                    />
	                    {formErrors.mobileNumber && <small className="field-error">{formErrors.mobileNumber}</small>}
	                  </label>
	                )}
	                  </div>

                  <div className="account-form-actions">
                    <button
                      type="submit"
                      className="account-submit-btn"
	                      disabled={accountRequestPending || (requiresGpsDevice && (devicesLoading || flespiDevices.length === 0))}
	                      title={requiresGpsDevice && flespiDevices.length === 0 ? 'Register a GPS device before creating an account.' : undefined}
                    >
                      {accountRequestPending
                        ? 'Saving...'
                        : editingAccountId ? 'Save Changes' : 'Create Account'}
                    </button>
                    {editingAccountId && (
                      <button
                        type="button"
                        className="account-action-btn ms-2"
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
                    placeholder="Search name, badge, email, device ID, or login"
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
                        <th>GPS Device</th>
                        <th>Login ID</th>
                        <th>Official Email</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsLoading ? (
                        <tr className="personnel-row">
                          <td colSpan={9} className="text-body-secondary small">
                            Loading accounts from MongoDB...
                          </td>
                        </tr>
                      ) : filteredAccounts.length === 0 ? (
                        <tr className="personnel-row">
                          <td colSpan={9} className="text-body-secondary small">
                            No account matched your search.
                          </td>
                        </tr>
                      ) : (
                        filteredAccounts.map((account, index) => (
                          <tr key={account.id} className="personnel-row">
	                            <td>
	                              <div className="account-name-cell">
	                                {account.photoUrl ? (
	                                  <img
	                                    className="account-table-avatar"
	                                    src={resolveApiAssetUrl(account.photoUrl)}
	                                    alt=""
	                                  />
	                                ) : (
	                                  <span className="account-table-avatar account-table-avatar--fallback" aria-hidden="true">
	                                    {(account.fullName || account.loginId || 'P').charAt(0).toUpperCase()}
	                                  </span>
	                                )}
	                                <span>{account.fullName || 'Supervisor account'}</span>
	                              </div>
	                            </td>
	                            <td>{account.role === 'Supervisor' ? 'Supervisor' : account.rank}</td>
	                            <td className="personnel-badge">{account.role === 'Supervisor' ? '-' : account.badgeNumber}</td>
	                            <td>
	                              {account.role === 'Supervisor' ? (
	                                <span className="text-body-secondary">Not required</span>
	                              ) : account.isMockAccount && !account.imei ? (
	                                <span className="text-body-secondary">No GPS device assigned</span>
	                              ) : (
	                                <>
	                                  <span>{getDeviceCode(account, index)} | {account.flespiDeviceName || 'Registered GPS'}</span>
	                                  <small className="d-block text-body-secondary">{account.imei}</small>
	                                </>
	                              )}
                            </td>
                            <td>{account.loginId}</td>
                            <td>
                              <span>{account.officialEmail || '-'}</span>
                              <small className="d-block text-body-secondary">
                                {account.emailVerified ? 'Verified' : 'Verification pending'}
                              </small>
                            </td>
                            <td>
                              <span
                                className="status-badge"
                                style={{ '--status-color': account.accountStatus === 'Active' ? '#2563eb' : '#64748b' }}
                              >
                                {account.accountStatus}
                              </span>
                            </td>
                            <td>{formatDateTime(account.createdAt)}</td>
                            <td className="account-actions-cell">
                              <div className="account-table-actions">
                                <button
                                  type="button"
                                  className="account-table-btn account-table-btn--edit"
                                  onClick={() => handleEditAccount(account.id)}
                                  disabled={accountRequestPending}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="account-table-btn account-table-btn--delete"
                                  onClick={() => handleDeleteAccount(account.id)}
                                  disabled={accountRequestPending || account.accountStatus === 'Inactive'}
                                >
                                  Delete
                                </button>
                              </div>
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
        title="Deactivate Account?"
        message={pendingDeleteAccount
          ? pendingDeleteAccount.role === 'Supervisor'
            ? `Deactivate ${pendingDeleteAccount.loginId}? Web administration access will stop.`
            : `Deactivate ${pendingDeleteAccount.fullName}? Mobile access will stop and the GPS device will be released for reassignment.`
          : ''}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteAccount}
        onCancel={handleCancelDeleteAccount}
      />
    </div>
  )
}

export default SettingsPage
