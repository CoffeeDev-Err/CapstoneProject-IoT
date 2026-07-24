import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import bgImage from '../assets/bg.jpg'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  // In a real app, you would handle authentication state via Context or Redux
  const navigate = useNavigate()

  const handleLogin = (event) => {
    event.preventDefault()
    // Simulate login logic
    if (email && password && code) {
      navigate('/')
    }
  }

  const handleSendCode = () => {
    if (email) {
      setCodeSent(true)
      alert(`Verification code sent to ${email}`)
    } else {
      alert('Please enter your email first.')
    }
  }

  return (
    <div
      className="login-page d-flex align-items-center justify-content-center vh-100 px-3"
      style={{ '--login-bg-image': `url(${bgImage})` }}
    >
      <div className="login-card card border-0 rounded-4 p-4 w-100">
        <div className="text-center mb-4 mt-2">
          <h3 className="login-title mb-1">Bantay Cabagan</h3>
          <p className="login-subtitle mb-0">CABAGAN POLICE STATION</p>
          <p className="login-caption mb-0">Philippine National Police</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-2">
            <label className="form-label login-label mb-1">Email</label>
            <div className="input-group login-input-group">
              <input
                type="email"
                className="form-control form-control-lg fs-6 login-input"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button
                type="button"
                className="btn login-action-btn"
                onClick={handleSendCode}
              >
                {codeSent ? 'Resend' : 'Send code'}
              </button>
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label login-label mb-1">Password</label>
            <div className="input-group login-input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control form-control-lg fs-6 login-input"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="btn login-action-btn"
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588zM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089z" />
                    <path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12-.708.708z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
                    <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label login-label mb-1">Verification Code</label>
            <input
              type="text"
              className="form-control form-control-lg fs-6 login-input"
              placeholder="Enter code sent to email"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-lg w-100 login-submit-btn fs-6 mb-2 rounded-3">
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage