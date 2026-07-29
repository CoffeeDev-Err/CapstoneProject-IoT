import { useState } from 'react'
import { confirmPasswordChange, requestPasswordChange } from '../services/auth'

const strongPassword = (value) => (
  value.length >= 10
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
)

function PasswordChangeModal({ open, token, onClose, onChanged }) {
  const [step, setStep] = useState('password')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (!open) return null

  const resetAndClose = () => {
    setStep('password')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setCode('')
    setChallenge(null)
    setError('')
    onClose()
  }

  const requestCode = async (event) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const nextChallenge = await requestPasswordChange(token, currentPassword)
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
    if (!strongPassword(newPassword)) {
      setError('Use at least 10 characters with upper, lower, number, and symbol.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    setPending(true)
    setError('')
    try {
      await confirmPasswordChange(token, challenge.challengeId, code, newPassword)
      resetAndClose()
      onChanged()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <div className="auth-modal__header">
          <div>
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

        <form onSubmit={step === 'password' ? requestCode : submitChange}>
          {step === 'password' ? (
            <label className="auth-field">
              <span>Current Password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          ) : (
            <>
              <label className="auth-field">
                <span>Verification Code</span>
                <input
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                />
              </label>
              <label className="auth-field">
                <span>New Password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Confirm New Password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              {challenge?.debugCode && (
                <p className="auth-debug-code">Development code: {challenge.debugCode}</p>
              )}
            </>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="login-submit-btn auth-modal__submit" disabled={pending}>
            {pending ? 'Please wait...' : step === 'password' ? 'Send Verification Code' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default PasswordChangeModal
