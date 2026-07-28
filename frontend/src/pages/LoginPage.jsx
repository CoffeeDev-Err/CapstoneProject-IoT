import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import frameImage from '../assets/image 4.png'

function LoginPage() {
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleLogin = (event) => {
    event.preventDefault()
    if (accountId.trim().length !== 6) {
      alert('Account ID must be exactly 6 characters.')
      return
    }
    if (!password) {
      alert('Please enter your password.')
      return
    }
    navigate('/')
  }

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
            <div className="login-badge">Secure Admin Access</div>
            <h1 className="login-copy-title">
              Hello, <span>Admin.</span>
            </h1>
            <p className="login-copy-subtitle">
              Sign in to manage personnel, operations, and incident response with confidence.
            </p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="mb-4">
              <label className="form-label login-label mb-2">Account Id</label>
              <input
                type="text"
                className="form-control form-control-lg fs-6 login-input"
                placeholder="Enter 6-character ID"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value.slice(0, 6))}
                maxLength={6}
                required
              />
            </div>

            <div className="mb-4">
              <label className="form-label login-label mb-2">Password</label>
              <input
                type="password"
                className="form-control form-control-lg fs-6 login-input"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-lg w-100 login-submit-btn fs-6 mb-2 rounded-3">
              Sign In
            </button>

            <p className="login-helper-text">
              Access is restricted to authorized personnel only.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
