/**
 * SettingsPage.jsx — System Configuration
 *
 * Provides UI controls for adjusting key system parameters.
 * Includes a supervisor-only account provisioning form so mobile users
 * do not need an in-app signup flow.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useFeedback } from '../context/useFeedback'
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
  normalizeBadgeNumber,
  normalizeEmail,
  normalizeHumanName,
  normalizeLoginId,
  normalizeMobileNumber,
} from '../utils/accountValidation'
import { getAccountEditCancelledMessage } from '../utils/workflowFeedback'
import { matchesPrefixSearch } from '../utils/searchMatching'
import {
  rankOptions,
} from '../features/accounts/accountPresentation'
import AccountRankPicker from '../features/accounts/AccountRankPicker'
import AccountTable from '../features/accounts/AccountTable'
import AccountGpsSelector from '../features/accounts/AccountGpsSelector'
import { useAccountForm } from '../features/accounts/useAccountForm'
import AccountDialogs from '../features/accounts/AccountDialogs'

function SettingsPage() {
  const { showFeedback } = useFeedback()
  const [createdAccounts, setCreatedAccounts] = useState([])
  const [accountSearch, setAccountSearch] = useState('')
  const deferredAccountSearch = useDeferredValue(accountSearch)
  const [editingAccountId, setEditingAccountId] = useState(null)
  const [activeAccountView, setActiveAccountView] = useState('create')
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(null)
  const [formMessage, setFormMessage] = useState('')
  const [formMessageKind, setFormMessageKind] = useState('success')
  const [flespiDevices, setFlespiDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [devicesError, setDevicesError] = useState('')
  const [devicesSetupPending, setDevicesSetupPending] = useState(false)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountRequestPending, setAccountRequestPending] = useState(false)
  const [accountActionNotice, setAccountActionNotice] = useState(null)

  useEffect(() => {
    if (formMessage) showFeedback(formMessage, { type: formMessageKind })
  }, [formMessage, formMessageKind, showFeedback])

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
    return createdAccounts.filter((account) => (
      matchesPrefixSearch(deferredAccountSearch, [
        account.fullName,
        account.rank,
        account.badgeNumber,
        account.imei,
        account.flespiDeviceName,
        account.loginId,
        account.officialEmail,
        account.accountStatus,
        account.mobileNumber,
      ])
    ))
  }, [createdAccounts, deferredAccountSearch])

  const assignedImeiToAccount = useMemo(
    () => new Map(createdAccounts.filter((account) => account.imei).map((account) => [account.imei, account])),
    [createdAccounts]
  )

  const editingAccount = useMemo(
    () => createdAccounts.find((account) => account.id === editingAccountId) || null,
    [createdAccounts, editingAccountId]
  )
  const {
    accountForm,
    setAccountForm,
    formErrors,
    setFormErrors,
    profilePhoto,
    setProfilePhoto,
    profilePhotoPreview,
    setProfilePhotoPreview,
    isEditingSupervisor,
    requiresGpsDevice,
    validateAccountForm,
    handleFieldChange,
    handleDeviceChange,
    handleRankChange,
    handleFieldBlur,
    handleProfilePhotoChange,
    handleGenerateTemporaryPassword,
    resetFormToCreate,
  } = useAccountForm({
    createdAccounts,
    editingAccount,
    editingAccountId,
    flespiDevices,
    setEditingAccountId,
  })
  const handleCancelEditAccount = () => {
    const accountLabel = editingAccount?.fullName || editingAccount?.loginId

    resetFormToCreate()
    setFormMessage(getAccountEditCancelledMessage(accountLabel))
    setFormMessageKind('info')
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
      rank: account.rank || rankOptions[0],
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
    setFormMessageKind('info')
  }

  const handleDeleteAccount = (accountId) => {
    const account = createdAccounts.find((item) => item.id === accountId)

    if (!account || account.isProtected || account.role === 'Supervisor') {
      if (account) {
        setFormMessage('COP/admin accounts are protected and cannot be deactivated.')
        setFormMessageKind('error')
      }
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
      const fieldLabels = {
        fullName: 'Enter a valid full name.',
        badgeNumber: 'Enter a valid and unique badge number.',
        rank: 'Select a valid rank.',
        imei: devicesLoading
          ? 'Wait for registered GPS devices to finish loading.'
          : 'Select an available registered GPS device.',
        loginId: 'Enter a valid and unique Login ID.',
        officialEmail: 'Enter a valid and unique official email address.',
        temporaryPassword: 'Provide a temporary password that meets all requirements.',
        mobileNumber: 'Correct the mobile number or leave the optional field blank.',
        profilePhoto: 'Choose a supported profile photo no larger than 5 MB.',
      }
      setAccountActionNotice({
        title: editingAccountId ? 'Cannot save changes yet' : 'Cannot create account yet',
        message: 'Complete or correct the highlighted account fields before continuing.',
        items: [...new Set(Object.keys(errors).map((field) => fieldLabels[field]).filter(Boolean))],
      })
      return
    }

    const normalizedPayload = isEditingSupervisor
      ? {
          fullName: normalizeHumanName(accountForm.fullName),
          rank: accountForm.rank,
          loginId: normalizeLoginId(accountForm.loginId),
          officialEmail: normalizeEmail(accountForm.officialEmail),
          temporaryPassword: accountForm.temporaryPassword,
          accountStatus: 'Active',
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
        if (formField) {
          setFormErrors((prev) => ({ ...prev, [formField]: error.message }))
          return
        }
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
            <div
              className="account-view-nav smooth-underline-control mb-3"
              role="tablist"
              aria-label="Account management views"
              style={{ '--smooth-underline-left': activeAccountView === 'create' ? '25%' : '75%' }}
            >
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

            {activeAccountView === 'create' && (
              <div className="account-create-section">
                <form className="account-form account-form--fixed" onSubmit={handleSubmitAccount} noValidate>
	                  {isEditingSupervisor && (
	                    <p className="settings-hint account-role-note">
	                      This protected COP/admin account is for web monitoring and administration. It cannot be deactivated. A badge, mobile number, and GPS device are not required.
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

	                {!isEditingSupervisor && (
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
	                )}

                <div className="account-field">
	                  <span id="account-rank-label">Rank *</span>
                <AccountRankPicker
                    value={accountForm.rank}
                    onChange={handleRankChange}
                    invalid={Boolean(formErrors.rank)}
                  />
                  {formErrors.rank && <small className="field-error">{formErrors.rank}</small>}
	                </div>

                {!isEditingSupervisor && (
                <AccountGpsSelector
                  assignedImeiToAccount={assignedImeiToAccount}
                  currentAccountId={editingAccountId}
                  deviceError={devicesError}
                  devices={flespiDevices}
                  loading={devicesLoading}
                  onChange={handleDeviceChange}
                  onRefresh={() => loadFlespiDevices({ refresh: true })}
                  requiresDevice={requiresGpsDevice}
                  selectedDeviceName={accountForm.flespiDeviceName}
                  selectedImei={accountForm.imei}
                  setupPending={devicesSetupPending}
                  validationError={formErrors.imei}
                />
                )}

                <label className="account-field">
                  <span>Login ID *</span>
                  <input
                    className={`settings-input w-100 ${formErrors.loginId ? 'settings-input--error' : ''}`}
                    value={accountForm.loginId}
                    onChange={handleFieldChange('loginId')}
                    onBlur={handleFieldBlur('loginId')}
                    placeholder="e.g., 12-2004"
                    inputMode="text"
                    maxLength={7}
                    autoComplete="username"
                    spellCheck="false"
                    aria-invalid={Boolean(formErrors.loginId)}
                  />
                  {!formErrors.loginId && (
                    <small className="settings-hint">
                      {editingAccount?.loginId && !/^\d{2}-\d{4}$/.test(editingAccount.loginId)
                        ? 'Replace this legacy Login ID with NN-NNNN before the account signs in again.'
                        : 'Use the NN-NNNN format, such as 12-2004.'}
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
	                      disabled={accountRequestPending}
                    >
                      {accountRequestPending
                        ? 'Saving...'
                        : editingAccountId ? 'Save Changes' : 'Create Account'}
                    </button>
                    {editingAccountId && (
                      <button
                        type="button"
                        className="account-action-btn ms-2"
                        onClick={handleCancelEditAccount}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {activeAccountView === 'manage' && (
              <AccountTable
                accountRequestPending={accountRequestPending}
                accountSearch={accountSearch}
                accounts={createdAccounts}
                accountsLoading={accountsLoading}
                filteredAccounts={filteredAccounts}
                onDeactivate={handleDeleteAccount}
                onEdit={handleEditAccount}
                onSearchChange={setAccountSearch}
              />
            )}
          </div>
        </div>
      </div>

      <AccountDialogs
        actionNotice={accountActionNotice}
        onCancelDeactivate={handleCancelDeleteAccount}
        onCloseActionNotice={() => setAccountActionNotice(null)}
        onConfirmDeactivate={handleConfirmDeleteAccount}
        pendingAccount={pendingDeleteAccount}
      />
    </div>
  )
}

export default SettingsPage
