import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import frameImage from '../assets/image 4.png'
import { useAuth } from '../context/useAuth'
import {
  beginLogin,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  verifyLoginCode,
} from '../services/auth'

const isStrongPassword = (value) => (
  value.length >= 10
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)
)

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
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { establishSession } = useAuth()

  const clearFeedback = () => {
    setError('')
    setMessage('')
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    clearFeedback()
    setPending(true)
    try {
      const nextChallenge = await beginLogin(accountId.trim(), password)
      setChallenge(nextChallenge)
      setCode('')
      setMode('otp')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  const handleVerifyLogin = async (event) => {
    event.preventDefault()
    clearFeedback()
    setPending(true)
    try {
      const session = await verifyLoginCode(challenge.challengeId, code)
      establishSession(session)
      navigate(location.state?.from || '/', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  const handleForgotPassword = async (event) => {
    event.preventDefault()
    clearFeedback()
    setPending(true)
    try {
      const nextChallenge = await requestPasswordReset(identifier.trim())
      if (nextChallenge.challengeId) {
        setChallenge(nextChallenge)
        setCode('')
        setMode('reset')
      } else {
        setMessage(nextChallenge.message)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  const handleResetPassword = async (event) => {
    event.preventDefault()
    clearFeedback()
    if (!isStrongPassword(newPassword)) {
      setError('Use at least 10 characters with upper, lower, number, and symbol.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
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
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  const handleResend = async () => {
    clearFeedback()
    setPending(true)
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

  const goToLogin = () => {
    clearFeedback()
    setMode('login')
    setChallenge(null)
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
      subtitle: `Enter the six-digit code sent to ${challenge?.maskedEmail || 'your official email'}.`,
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
    <div className="login-page d-flex align-items-bottom justify-content-bottom vh-100 px-3">
      <div className="login-layout">
        <div className="login-hero position-relative">
          <div className="hero-circle circle-1" />
          <div className="hero-circle circle-2" />
          <img src={frameImage} alt="Police personnel" className="login-hero-image" />
        </div>

        <div className="login-card card border-0 shadow-sm">
          <div className="login-copy">
            <div className="login-badge">{copy.badge}</div>
            <h1 className="login-copy-title">{copy.title}</h1>
            <p className="login-copy-subtitle">{copy.subtitle}</p>
          </div>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="login-form">
              <label className="login-field">
                <span className="login-label">Login ID</span>
                <input
                  type="text"
                  className="form-control form-control-lg fs-6 login-input"
                  placeholder="Enter your Login ID"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="login-field">
                <span className="login-label">Password</span>
                <input
                  type="password"
                  className="form-control form-control-lg fs-6 login-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button
                type="button"
                className="login-text-action"
                onClick={() => {
                  clearFeedback()
                  setIdentifier(accountId)
                  setMode('forgot')
                }}
              >
                Forgot password?
              </button>
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} label="Sign In" />
            </form>
          )}

          {mode === 'otp' && (
            <form onSubmit={handleVerifyLogin} className="login-form">
              <CodeField code={code} setCode={setCode} />
              {challenge?.debugCode && (
                <p className="auth-debug-code">Development code: {challenge.debugCode}</p>
              )}
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} label="Verify and Continue" />
              <button type="button" className="login-text-action login-text-action--center" onClick={handleResend} disabled={pending}>
                Resend code
              </button>
              <button type="button" className="login-text-action login-text-action--center" onClick={goToLogin}>
                Use another account
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="login-form">
              <label className="login-field">
                <span className="login-label">Login ID or Official Email</span>
                <input
                  type="text"
                  className="form-control form-control-lg fs-6 login-input"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </label>
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} label="Send Reset Code" />
              <button type="button" className="login-text-action login-text-action--center" onClick={goToLogin}>
                Back to sign in
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="login-form">
              <CodeField code={code} setCode={setCode} />
              <label className="login-field">
                <span className="login-label">New Password</span>
                <input
                  type="password"
                  className="form-control form-control-lg fs-6 login-input"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="login-field">
                <span className="login-label">Confirm New Password</span>
                <input
                  type="password"
                  className="form-control form-control-lg fs-6 login-input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              {challenge?.debugCode && (
                <p className="auth-debug-code">Development code: {challenge.debugCode}</p>
              )}
              <AuthFeedback error={error} message={message} />
              <SubmitButton pending={pending} label="Reset Password" />
              <button type="button" className="login-text-action login-text-action--center" onClick={goToLogin}>
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function CodeField({ code, setCode }) {
  return (
    <label className="login-field">
      <span className="login-label">Verification Code</span>
      <input
        inputMode="numeric"
        className="form-control form-control-lg fs-6 login-input login-code-input"
        placeholder="000000"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        maxLength={6}
        autoComplete="one-time-code"
        required
      />
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

function SubmitButton({ pending, label }) {
  return (
    <button type="submit" className="btn btn-lg w-100 login-submit-btn fs-6 rounded-3" disabled={pending}>
      {pending ? 'Please wait...' : label}
    </button>
  )
}

export default LoginPage
