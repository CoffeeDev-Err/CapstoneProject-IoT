import { useState } from 'react'
import {
  ACCOUNT_FIELD_LIMITS,
  normalizeEmail,
  validateBadgeNumber,
  validateFullName,
  validateLoginId,
  validateMobileNumber,
  validateOfficialEmail,
  validateRank,
} from '../../utils/accountValidation'
import { createInitialAccountForm, createTempPassword } from './accountPresentation'

const initialFormState = createInitialAccountForm()

export function useAccountForm({
  createdAccounts,
  editingAccount,
  editingAccountId,
  flespiDevices,
  setEditingAccountId,
}) {
  const [accountForm, setAccountForm] = useState(initialFormState)
  const [formErrors, setFormErrors] = useState({})
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const isEditingSupervisor = editingAccount?.role === 'Supervisor'
  const isEditingMockAccount = Boolean(editingAccount?.isMockAccount)
  const requiresGpsDevice = !isEditingSupervisor && !isEditingMockAccount

  const validateAccountForm = () => {
    const errors = {}
    const fullNameError = validateFullName(accountForm.fullName)
    const rankError = validateRank(accountForm.rank)
    if (fullNameError) errors.fullName = fullNameError
    if (rankError) errors.rank = rankError

    if (!isEditingSupervisor) {
      const badgeNumberError = validateBadgeNumber(accountForm.badgeNumber)
      const mobileNumberError = validateMobileNumber(accountForm.mobileNumber)
      if (badgeNumberError) errors.badgeNumber = badgeNumberError
      if (mobileNumberError) errors.mobileNumber = mobileNumberError
      if (requiresGpsDevice && !accountForm.imei.trim()) {
        errors.imei = 'GPS device ID is required.'
      } else if (accountForm.imei.trim()
        && !flespiDevices.some((device) => device.imei === accountForm.imei)) {
        errors.imei = 'Select a device ID registered in Flespi.'
      }
      const duplicateBadge = createdAccounts.some((account) => (
        account.id !== editingAccountId
        && String(account.badgeNumber || '').toLowerCase() === accountForm.badgeNumber.trim().toLowerCase()
      ))
      if (!errors.badgeNumber && duplicateBadge) errors.badgeNumber = 'Badge number already exists.'
      const duplicateImei = accountForm.imei.trim() && createdAccounts.some((account) => (
        account.id !== editingAccountId && account.imei === accountForm.imei.trim()
      ))
      if (duplicateImei) errors.imei = 'Device ID is already assigned to another personnel account.'
    }

    const loginIdError = validateLoginId(accountForm.loginId, {
      accountType: isEditingSupervisor ? 'supervisor' : 'officer',
      existingLoginId: editingAccount?.loginId || '',
    })
    if (loginIdError) errors.loginId = loginIdError
    const duplicateLogin = createdAccounts.some((account) => (
      account.id !== editingAccountId
      && String(account.loginId || '').toLowerCase() === accountForm.loginId.trim().toLowerCase()
    ))
    if (!errors.loginId && duplicateLogin) errors.loginId = 'Login ID already exists.'

    const normalizedEmail = normalizeEmail(accountForm.officialEmail)
    const emailError = validateOfficialEmail(normalizedEmail)
    if (emailError) errors.officialEmail = emailError
    const duplicateEmail = createdAccounts.some((account) => (
      account.id !== editingAccountId
      && account.officialEmail?.toLowerCase() === normalizedEmail
    ))
    if (!errors.officialEmail && duplicateEmail) {
      errors.officialEmail = 'Official email already belongs to another account.'
    }

    const passwordValue = accountForm.temporaryPassword
    const passwordRulesPassed = passwordValue.length >= 10
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

  const clearFieldError = (field) => {
    setFormErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }
  const handleFieldChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setAccountForm((current) => ({ ...current, [field]: value }))
    clearFieldError(field)
  }
  const handleDeviceChange = (event) => {
    const imei = event.target.value
    const device = flespiDevices.find((item) => item.imei === imei)
    setAccountForm((current) => ({
      ...current,
      imei,
      flespiDeviceId: device?.id || '',
      flespiDeviceName: device?.name || '',
    }))
    clearFieldError('imei')
  }
  const handleRankChange = (rank) => {
    setAccountForm((current) => ({ ...current, rank }))
    clearFieldError('rank')
  }
  const handleFieldBlur = (field) => () => {
    const nextError = validateAccountForm()[field]
    setFormErrors((current) => {
      const next = { ...current }
      if (nextError) next[field] = nextError
      else delete next[field]
      return next
    })
  }
  const handleProfilePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!supportedTypes.includes(file.type)) {
      setProfilePhoto(null)
      setFormErrors((current) => ({ ...current, profilePhoto: 'Use a JPEG, PNG, or WebP image.' }))
      event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfilePhoto(null)
      setFormErrors((current) => ({ ...current, profilePhoto: 'Profile photo must be 5 MB or smaller.' }))
      event.target.value = ''
      return
    }
    setProfilePhoto(file)
    clearFieldError('profilePhoto')
    const reader = new FileReader()
    reader.onload = () => setProfilePhotoPreview(String(reader.result || ''))
    reader.readAsDataURL(file)
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

  return {
    accountForm,
    setAccountForm,
    formErrors,
    setFormErrors,
    profilePhoto,
    setProfilePhoto,
    profilePhotoPreview,
    setProfilePhotoPreview,
    isEditingSupervisor,
    isEditingMockAccount,
    requiresGpsDevice,
    validateAccountForm,
    handleFieldChange,
    handleDeviceChange,
    handleRankChange,
    handleFieldBlur,
    handleProfilePhotoChange,
    handleGenerateTemporaryPassword: () => {
      setAccountForm((current) => ({ ...current, temporaryPassword: createTempPassword() }))
    },
    resetFormToCreate,
  }
}
