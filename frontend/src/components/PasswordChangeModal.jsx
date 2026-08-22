import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { confirmPasswordChange, requestPasswordChange, resendVerificationCode } from '../services/auth'
import VerificationCodeInput from './VerificationCodeInput'
import { useAccessibleDialog } from '../hooks/useAccessibleDialog'

const strongPassword = (value) => (
  value.length >= 10
  && value.length <= 128
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
)

const PASSWORD_REQUIREMENTS = 'Use 10-128 characters, including an uppercase letter, lowercase letter, number, and symbol.'

function PasswordChangeModal({ open, onClose, onChanged }) {
  const [step, setStep] = useState('password')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const missingRequiredFields = step === 'password'
    ? !currentPassword
    : code.length !== 6 || !newPassword || !confirmPassword

  const resetAndClose = () => {
    setStep('password')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setCode('')
    setChallenge(null)
    setError('')
    setMessage('')
    onClose()
  }

  const dialogRef = useAccessibleDialog(open, resetAndClose)

  if (!open) return null

  const requestCode = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!currentPassword) {
      setError('Enter your current password.')
      return
    }
    setPending(true)
    try {
      const nextChallenge = await requestPasswordChange(currentPassword)
      setChallenge(nextChallenge)
      setStep('verify')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  const submitChange = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (code.length !== 6) {
      setError('Enter the complete 6-digit verification code.')
      return
    }
    if (!newPassword) {
      setError('Enter a new password.')
      return
    }
    if (!strongPassword(newPassword)) {
      setError(PASSWORD_REQUIREMENTS)
      return
    }
    if (!confirmPassword) {
      setError('Confirm your new password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current password.')
      return
    }
    setPending(true)
    setError('')
    try {
      await confirmPasswordChange(challenge.challengeId, code, newPassword)
      resetAndClose()
      onChanged()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  const resendCode = async () => {
    setPending(true)
    setError('')
    setMessage('')
    try {
      const nextChallenge = await resendVerificationCode(challenge.challengeId)
      setChallenge(nextChallenge)
      setCode('')
      setMessage(`A new code was sent to ${nextChallenge.maskedEmail}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <div ref={dialogRef} className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title" tabIndex={-1}>
        <div className="auth-modal__header">
          <div>
            <span className="auth-modal__step">Step {step === 'password' ? '1' : '2'} of 2</span>
            <h2 id="change-password-title">Change Password</h2>
            <p>
              {step === 'password'
                ? 'Confirm your current password first.'
                : `Enter the code sent to ${challenge?.maskedEmail}.`}
            </p>
          </div>
          <button type="button" className="auth-modal__close" onClick={resetAndClose} aria-label="Close">
            &times;
          </button>
        </div>

        <form onSubmit={step === 'password' ? requestCode : submitChange} noValidate>
          {step === 'password' ? (
            <ModalPasswordField
              label="Current Password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={128}
              autoFocus
            />
          ) : (
            <>
              <VerificationCodeInput
                value={code}
                onChange={setCode}
                autoFocus
                invalid={Boolean(error && /code|verification/i.test(error))}
              />
              <ModalPasswordField
                label="New Password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                maxLength={128}
              />
              <ModalPasswordField
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                maxLength={128}
              />
              <p className="password-requirements">{PASSWORD_REQUIREMENTS}</p>
            </>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}
          <button
            type="submit"
            className="login-submit-btn auth-modal__submit"
            disabled={pending || missingRequiredFields}
          >
            {pending ? 'Please wait...' : step === 'password' ? 'Send Verification Code' : 'Update Password'}
          </button>
          {step === 'verify' && (
            <button
              type="button"
              className="login-text-action login-text-action--center"
              onClick={resendCode}
              disabled={pending}
            >
              Resend code
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

function ModalPasswordField({ label, ...inputProps }) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="auth-field">
      <span>{label}</span>
      <span className="auth-password-control">
        <input {...inputProps} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
    </label>
  )
}

export default PasswordChangeModal
