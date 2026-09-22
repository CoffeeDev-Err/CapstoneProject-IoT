import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import pnpLogo from '../assets/pnp-logo.png'
import VerificationCodeInput from '../components/VerificationCodeInput'
import { formatCountdown, verificationFeedback } from '../features/auth/verificationFeedback'
import { useVerificationTiming } from '../features/auth/useVerificationTiming'
import { COMPLETE_CODE_MESSAGE, PASSWORD_REQUIREMENTS } from '../features/auth/authCopy'
import { useAuth } from '../context/useAuth'
import {
  LOGIN_ID_PATTERN,
  validateOfficialEmail,
} from '../utils/accountValidation'
import {
  beginLogin,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  verifyLoginCode,
} from '../services/auth'

const isStrongPassword = (value) => (
  value.length >= 10
  && value.length <= 128
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
)

const LOGIN_ID_FORMAT_MESSAGE = 'Login ID must use the NN-NNNN format, such as 12-2004.'

const getRecoveryIdentifierError = (value) => {
  const identifier = value.trim()
  if (!identifier) return 'Login ID or official email is required.'
  if (identifier.includes('@')) return validateOfficialEmail(identifier)
  return LOGIN_ID_PATTERN.test(identifier) ? '' : LOGIN_ID_FORMAT_MESSAGE
}

function LoginPage() {
  const [mode, setMode] = useState('login')
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [pendingAction, setPendingAction] = useState('')
  const [resendRetry, setResendRetry] = useState(null)
  const [loginRetry, setLoginRetry] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const timing = useVerificationTiming(challenge, resendRetry)
  const loginTiming = useVerificationTiming(null, loginRetry)
  const normalizedAccountId = accountId.trim().toLowerCase()
  const loginRateLimited = Boolean(
    loginRetry
    && loginRetry.loginId === normalizedAccountId
    && loginTiming.resendSeconds > 0,
  )
  const loginRateLimitMessage = loginRateLimited
    ? `Too many failed sign-in attempts. Try again in ${formatCountdown(loginTiming.resendSeconds)}.`
    : ''
  const loginFeedbackError = loginRetry?.loginId === normalizedAccountId
    ? loginRateLimitMessage
    : error
  const verificationBusy = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { establishSession } = useAuth()

  const clearFeedback = () => {
    setError('')
    setMessage('')
  }

  const clearFieldError = (field) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
  }

  const showRequestError = (requestError, sendingCode = false) => {
    const feedback = verificationFeedback(requestError)
    setError(feedback.message)
    if (feedback.clearCode) {
      setCode('')
      setFocusRequest((value) => value + 1)
    }
    if (sendingCode && requestError.retryAt) setResendRetry(requestError)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    if (loginRateLimited) return
    clearFeedback()
    const nextFieldErrors = {}
    if (!accountId.trim()) nextFieldErrors.accountId = 'Login ID is required.'
    else if (!LOGIN_ID_PATTERN.test(accountId.trim())) {
      nextFieldErrors.accountId = LOGIN_ID_FORMAT_MESSAGE
    }
    if (!password) nextFieldErrors.password = 'Password is required.'
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length > 0) {
      return
    }
    setPendingAction('Sending verification code...')
    setPending(true)
    try {
      const nextChallenge = await beginLogin(accountId.trim(), password)
      setLoginRetry(null)
      setChallenge(nextChallenge)
      setResendRetry(null)
      setCode('')
      setMode('otp')
      setMessage(`A verification code was sent to ${nextChallenge.maskedEmail}.`)
    } catch (requestError) {
      if (requestError?.code === 'RATE_LIMITED' && requestError.retryAt) {
        setLoginRetry({ ...requestError, loginId: normalizedAccountId })
      }
      showRequestError(requestError)
    } finally {
      setPending(false)
    }
  }

  const verifyCode = async (nextCode) => {
    if (pending || verificationBusy.current || !challenge) return
    clearFeedback()
    if (nextCode.length !== 6) {
      setFieldErrors({ code: COMPLETE_CODE_MESSAGE })
      return
    }
    setFieldErrors({})
    verificationBusy.current = true
    setPendingAction('Verifying code...')
    setPending(true)
    try {
      const session = await verifyLoginCode(challenge.challengeId, nextCode)
      establishSession(session)
      navigate(location.state?.from || '/map', { replace: true })
    } catch (requestError) {
      showRequestError(requestError)
    } finally {
      verificationBusy.current = false
      setPending(false)
    }
  }

  const handleVerifyLogin = (event) => {
    event.preventDefault()
    void verifyCode(code)
  }

  const handleLoginCodeChange = (nextCode) => {
    if (pending || verificationBusy.current || nextCode === code) return
    setCode(nextCode)
    clearFieldError('code')
    clearFeedback()
    // Submit the newly entered value directly; state still contains the previous digit.
    if (nextCode.length === 6) void verifyCode(nextCode)
  }

  const handleForgotPassword = async (event) => {
    event.preventDefault()
    clearFeedback()
    const identifierError = getRecoveryIdentifierError(identifier)
    if (identifierError) {
      setFieldErrors({ identifier: identifierError })
      return
    }
    setFieldErrors({})
    setPendingAction('Sending reset code...')
    setPending(true)
    try {
      const nextChallenge = await requestPasswordReset(identifier.trim())
      if (nextChallenge.challengeId) {
        setChallenge(nextChallenge)
        setResendRetry(null)
        setCode('')
        setMode('reset')
      } else {
        setMessage(nextChallenge.message)
      }
    } catch (requestError) {
      if (['ACCOUNT_NOT_FOUND', 'INVALID_LOGIN_ID_FORMAT', 'INVALID_RESET_INPUT']
        .includes(requestError?.code)) {
        setFieldErrors({ identifier: requestError.message })
        return
      }
      showRequestError(requestError, true)
    } finally {
      setPending(false)
    }
  }

  const handleResetPassword = async (event) => {
    event.preventDefault()
    clearFeedback()
    const nextFieldErrors = {}
    if (code.length !== 6) {
      nextFieldErrors.code = COMPLETE_CODE_MESSAGE
    }
    if (!newPassword) {
      nextFieldErrors.newPassword = 'New password is required.'
    } else if (!isStrongPassword(newPassword)) {
      nextFieldErrors.newPassword = PASSWORD_REQUIREMENTS
    }
    if (!confirmPassword) {
      nextFieldErrors.confirmPassword = 'Password confirmation is required.'
    } else if (newPassword && newPassword !== confirmPassword) {
      nextFieldErrors.confirmPassword = 'The new password and confirmation do not match.'
    }
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length > 0) {
      return
    }
    setPendingAction('Resetting password...')
    setPending(true)
    try {
      await resetPassword(challenge.challengeId, code, newPassword)
      setMode('login')
      setPassword('')
      setCode('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated. Sign in with your new password.')
    } catch (requestError) {
      showRequestError(requestError)
    } finally {
      setPending(false)
    }
  }

  const handleResend = async () => {
    if (pending || verificationBusy.current || timing.resendSeconds > 0) return
    verificationBusy.current = true
    clearFeedback()
    setPendingAction('Sending new code...')
    setPending(true)
    try {
      if (mode === 'reset') {
        // Start a fresh reset challenge from the original account identifier.
        const nextChallenge = await requestPasswordReset(identifier.trim())
        setChallenge(nextChallenge)
        setResendRetry(null)
        setCode('')
        setMessage(nextChallenge.message || 'A new verification code was sent.')
      } else {
        const nextChallenge = await resendVerificationCode(challenge.challengeId)
        setChallenge(nextChallenge)
        setResendRetry(null)
        setCode('')
        setMessage(`A new code was sent to ${nextChallenge.maskedEmail}.`)
      }
    } catch (requestError) {
      showRequestError(requestError, true)
    } finally {
      verificationBusy.current = false
      setPending(false)
    }
  }

  const goToLogin = () => {
    if (pending || verificationBusy.current) return
    clearFeedback()
    setFieldErrors({})
    setMode('login')
    setChallenge(null)
    setResendRetry(null)
    setCode('')
  }

  const copy = {
    login: {
      badge: 'Secure Admin Access',
      title: <>Hello, <span>Admin.</span></>,
      subtitle: 'Sign in to manage personnel, operations, and incident response.',
    },
    otp: {
      badge: 'Email Verification',
      title: <>Check your <span>email.</span></>,
      subtitle: '',
    },
    forgot: {
      badge: 'Account Recovery',
      title: <>Reset your <span>password.</span></>,
      subtitle: 'Enter your Login ID or official email to receive a verification code.',
    },
    reset: {
      badge: 'Secure Password Reset',
      title: <>Create a new <span>password.</span></>,
      subtitle: `Enter the code sent to ${challenge?.maskedEmail || 'your official email'}.`,
    },
  }[mode]

  return (
    <div className="login-page">
      <div className="login-accent login-accent--top" aria-hidden="true" />
      <div className="login-accent login-accent--bottom" aria-hidden="true" />
      <main className="login-layout">
        <section className="login-intro" aria-labelledby="login-intro-title">
          <p className="login-intro__eyebrow">Police Personnel Monitoring System</p>
          <h1 id="login-intro-title">Operational visibility for a safer Cabagan.</h1>
          <p className="login-intro__description">
            GeoSentri is the secure web and mobile operations portal of the Cabagan Police Station
            in Isabela. It supports authorized personnel monitoring, deployment coordination,
            geofencing alerts, and operational reporting.
          </p>
          <p className="login-intro__access-note">
            Access is restricted to authorized police personnel and administrators.
          </p>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-brand">
            <span className="login-brand__logo-frame">
              <img src={pnpLogo} alt="Philippine National Police seal" className="login-brand__logo" />
            </span>
            <div>
              <strong>GeoSentri</strong>
              <span>Philippine National Police</span>
            </div>
          </div>

          <div className="login-form-card">
            <div className="login-copy">
              <div className="login-badge">{copy.badge}</div>
              <h2 id="login-title" className="login-copy-title">{copy.title}</h2>
              {copy.subtitle && <p className="login-copy-subtitle">{copy.subtitle}</p>}
            </div>

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="login-form" noValidate>
              <label className="login-field">
                <span className="login-label">Login ID</span>
                <input
                  type="text"
                  className="form-control form-control-lg fs-6 login-input"
                  placeholder="e.g., 01-2002"
                  value={accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value)
                    clearFieldError('accountId')
                    if (error) setError('')
                  }}
                  autoComplete="username"
                  inputMode="numeric"
                  pattern="[0-9]{2}-[0-9]{4}"
                  maxLength={7}
                  required
                  aria-invalid={Boolean(fieldErrors.accountId)}
                />
                {fieldErrors.accountId && <small className="login-field-error">{fieldErrors.accountId}</small>}
              </label>
              <PasswordField
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  clearFieldError('password')
                }}
                autoComplete="current-password"
                maxLength={128}
                required
                error={fieldErrors.password}
              />
              <button
                type="button"
                className="login-text-action"
                onClick={() => {
                  clearFeedback()
                  setFieldErrors({})
                  setIdentifier(accountId)
                  setMode('forgot')
                }}
              >
                Forgot password?
              </button>
              <AuthFeedback error={loginFeedbackError} message={message} />
              <SubmitButton
                pending={pending}
                pendingLabel={pendingAction}
                label="Sign In"
                disabled={loginRateLimited}
              />
              </form>
            )}

            {mode === 'otp' && (
              <form onSubmit={handleVerifyLogin} className="login-form" noValidate>
              <VerificationCodeInput
                value={code}
                onChange={handleLoginCodeChange}
                disabled={pending}
                focusRequest={focusRequest}
                autoFocus
                invalid={Boolean(error || fieldErrors.code)}
              />
              {fieldErrors.code && <small className="login-field-error">{fieldErrors.code}</small>}
              {timing.expirationLabel && <p className="password-requirements">{timing.expirationLabel}</p>}
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} pendingLabel={pendingAction} label="Verify and Continue" />
              <button type="button" className="login-text-action login-text-action--center" onClick={handleResend} disabled={pending || timing.resendSeconds > 0}>
                {timing.resendLabel}
              </button>
              <button type="button" className="login-text-action login-text-action--center" onClick={goToLogin} disabled={pending}>
                Use another account
              </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="login-form" noValidate>
              <label className="login-field">
                <span className="login-label">Login ID or Official Email</span>
                <input
                  type="text"
                  className="form-control form-control-lg fs-6 login-input"
                  placeholder="e.g., 01-2002 or example@gmail.com"
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value)
                    clearFieldError('identifier')
                    if (error) setError('')
                  }}
                  maxLength={254}
                  autoComplete="username"
                  required
                  aria-invalid={Boolean(fieldErrors.identifier)}
                />
                {fieldErrors.identifier && <small className="login-field-error">{fieldErrors.identifier}</small>}
              </label>
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} pendingLabel={pendingAction} label="Send Reset Code" />
              <button type="button" className="login-text-action login-text-action--center" onClick={goToLogin}>
                Back to sign in
              </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleResetPassword} className="login-form" noValidate>
              <VerificationCodeInput
                value={code}
                onChange={(value) => {
                  setCode(value)
                  clearFieldError('code')
                }}
                focusRequest={focusRequest}
                autoFocus
                disabled={pending}
                invalid={Boolean(fieldErrors.code)}
              />
              {fieldErrors.code && <small className="login-field-error">{fieldErrors.code}</small>}
              {timing.expirationLabel && <p className="password-requirements">{timing.expirationLabel}</p>}
              <PasswordField
                label="New Password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  clearFieldError('newPassword')
                }}
                autoComplete="new-password"
                maxLength={128}
                required
                error={fieldErrors.newPassword}
              />
              <p className="password-requirements">{PASSWORD_REQUIREMENTS}</p>
              <PasswordField
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  clearFieldError('confirmPassword')
                }}
                autoComplete="new-password"
                maxLength={128}
                required
                error={fieldErrors.confirmPassword}
              />
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} pendingLabel={pendingAction} label="Reset Password" />
              <button type="button" className="login-text-action login-text-action--center" onClick={handleResend} disabled={pending || timing.resendSeconds > 0}>
                {timing.resendLabel}
              </button>
              <button type="button" className="login-text-action login-text-action--center" onClick={goToLogin}>
                Cancel
              </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function PasswordField({ label, error, ...inputProps }) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="login-field">
      <span className="login-label">{label}</span>
      <span className="login-password-control">
        <input
          {...inputProps}
          type={visible ? 'text' : 'password'}
          className="form-control form-control-lg fs-6 login-input login-password-input"
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          className="login-password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
      {error && <small className="login-field-error">{error}</small>}
    </label>
  )
}

function AuthFeedback({ error, message }) {
  return (
    <>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}
    </>
  )
}

function SubmitButton({ pending, label, pendingLabel = 'Please wait...', disabled = false }) {
  return (
    <button type="submit" className="btn btn-lg w-100 login-submit-btn fs-6 rounded-3" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </button>
  )
}

export default LoginPage
