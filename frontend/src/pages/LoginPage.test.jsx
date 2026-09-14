import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LoginPage from './LoginPage'
import { beginLogin, requestPasswordReset, resendVerificationCode, resetPassword, verifyLoginCode } from '../services/auth'

const establishSession = vi.hoisted(() => vi.fn())
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ establishSession }) }))
vi.mock('../services/auth', () => ({
  beginLogin: vi.fn(), requestPasswordReset: vi.fn(), resendVerificationCode: vi.fn(),
  resetPassword: vi.fn(), verifyLoginCode: vi.fn(),
}))
const challenge = { challengeId: 'first', maskedEmail: 'o***@example.com' }
const session = { token: 'test-session' }
const digit = (index = 1) => screen.getByLabelText(`Verification code digit ${index} of 6`)
const paste = (code) => fireEvent.paste(digit(), { clipboardData: { getData: () => code } })

beforeEach(() => {
  vi.resetAllMocks()
  beginLogin.mockResolvedValue(challenge)
  verifyLoginCode.mockResolvedValue(session)
  requestPasswordReset.mockResolvedValue(challenge)
  resendVerificationCode.mockResolvedValue({ ...challenge, challengeId: 'resent' })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function renderLogin() {
  render(<MemoryRouter initialEntries={['/login']}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<p>Signed in</p>} />
  </Routes></MemoryRouter>)
}
async function openVerification() {
  renderLogin()
  fireEvent.change(screen.getByLabelText('Login ID'), { target: { value: '01-2002' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
  fireEvent.click(screen.getByText('Sign In'))
  await screen.findByLabelText('Verification code digit 1 of 6')
}

describe('automatic login verification', () => {
  it('clears an incorrect code and focuses the first digit for a fresh attempt', async () => {
    verifyLoginCode.mockRejectedValueOnce(Object.assign(new Error('Wrong'), { code: 'INCORRECT_OTP' }))
    await openVerification()
    paste('123456')
    await screen.findByText('Incorrect code. Check your email and enter the code again.')
    expect(digit()).toHaveValue('')
    expect(digit()).toHaveFocus()
    expect(verifyLoginCode).toHaveBeenCalledTimes(1)
    paste('654321')
    await screen.findByText('Signed in')
    expect(verifyLoginCode).toHaveBeenLastCalledWith('first', '654321')
  })

  it('keeps the code on a network error and explains the recovery action', async () => {
    verifyLoginCode.mockRejectedValueOnce(Object.assign(new Error('Network'), { code: 'NETWORK_ERROR' }))
    await openVerification()
    paste('123456')
    await screen.findByText(/Connection problem/)
    expect(digit()).toHaveValue('1')
    fireEvent.click(screen.getByText('Verify and Continue'))
    await screen.findByText('Signed in')
  })

  it('counts down server deadlines despite device clock skew and enables resend when due', async () => {
    vi.useFakeTimers()
    const receivedAt = Date.now()
    const serverTime = '2020-01-01T00:00:00.000Z'
    beginLogin.mockResolvedValue({ ...challenge, receivedAt, serverTime,
      resendAvailableAt: '2020-01-01T00:00:05.000Z', expiresAt: '2020-01-01T00:00:10.000Z' })
    renderLogin()
    fireEvent.change(screen.getByLabelText('Login ID'), { target: { value: '01-2002' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    await act(async () => { fireEvent.click(screen.getByText('Sign In')) })
    expect(screen.getByText('Resend code in 0:05')).toBeDisabled()
    expect(screen.getByText('Code expires in 0:10')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000) })
    expect(screen.getByText('Resend code')).toBeEnabled()
    expect(screen.getByText('Code expired. Request a new code.')).toBeInTheDocument()
    expect(verifyLoginCode).not.toHaveBeenCalled()
  })

  it('uses a server retry deadline after a resend is rate limited', async () => {
    resendVerificationCode.mockRejectedValueOnce(Object.assign(new Error('Too many codes requested.'), {
      code: 'OTP_RATE_LIMITED', retryAt: new Date(Date.now() + 60_000).toISOString(),
    }))
    await openVerification()
    fireEvent.click(screen.getByText('Resend code'))
    await screen.findByText('Too many codes requested.')
    expect(screen.getByRole('button', { name: /Resend code in/ })).toBeDisabled()
    expect(screen.getByText('Verify and Continue')).toBeEnabled()
  })
  it('waits for the sixth typed digit, then signs in without a button click', async () => {
    await openVerification()
    expect(screen.getByText('A verification code was sent to o***@example.com.')).toBeInTheDocument()
    expect(screen.queryByText(/Enter the six-digit code sent to/)).not.toBeInTheDocument()
    expect(screen.queryByText(/verifies automatically/)).not.toBeInTheDocument()
    expect(screen.getByText('Verify and Continue')).toBeInTheDocument()
    for (let index = 1; index <= 5; index++) fireEvent.change(digit(index), { target: { value: String(index) } })
    expect(verifyLoginCode).not.toHaveBeenCalled()
    fireEvent.change(digit(6), { target: { value: '6' } })
    await screen.findByText('Signed in')
    expect(verifyLoginCode).toHaveBeenCalledExactlyOnceWith('first', '123456')
    expect(establishSession).toHaveBeenCalledWith(session)
  })

  it('accepts pasted codes and prevents concurrent submit, edits, resend, or account changes', async () => {
    let resolve
    verifyLoginCode.mockImplementation(() => new Promise((done) => { resolve = done }))
    await openVerification()
    paste('123 456')
    expect(digit()).toBeDisabled()
    paste('654321')
    fireEvent.submit(digit().closest('form'))
    fireEvent.click(screen.getByText('Resend code'))
    fireEvent.click(screen.getByText('Use another account'))
    expect(verifyLoginCode).toHaveBeenCalledExactlyOnceWith('first', '123456')
    expect(resendVerificationCode).not.toHaveBeenCalled()
    await act(async () => resolve(session))
    expect(screen.getByText('Signed in')).toBeInTheDocument()
  })

  it('keeps the fallback available after failure and retries only when requested', async () => {
    verifyLoginCode.mockRejectedValueOnce(new Error('Connection failed.'))
    await openVerification()
    // The browser delivers autofill through the same change event.
    fireEvent.change(digit(), { target: { value: '123456' } })
    await screen.findByText('Connection failed.')
    expect(verifyLoginCode).toHaveBeenCalledTimes(1)
    paste('123456')
    expect(verifyLoginCode).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Verify and Continue'))
    await screen.findByText('Signed in')
    expect(verifyLoginCode).toHaveBeenCalledTimes(2)
  })

  it('automatically verifies a corrected code after rejection', async () => {
    verifyLoginCode.mockRejectedValueOnce(new Error('Invalid code.'))
    await openVerification()
    paste('123456')
    await screen.findByText('Invalid code.')
    fireEvent.change(digit(6), { target: { value: '7' } })
    await screen.findByText('Signed in')
    expect(verifyLoginCode).toHaveBeenLastCalledWith('first', '123457')
  })

  it('keeps the fallback and uses the new challenge after resend', async () => {
    verifyLoginCode.mockRejectedValueOnce(new Error('Expired code.'))
    await openVerification()
    paste('123456')
    await screen.findByText('Expired code.')
    fireEvent.click(screen.getByText('Resend code'))
    await waitFor(() => expect(digit()).toHaveValue(''))
    expect(screen.getByText('Verify and Continue')).toBeInTheDocument()
    paste('123456')
    await screen.findByText('Signed in')
    expect(verifyLoginCode).toHaveBeenLastCalledWith('resent', '123456')
  })

  it('does not submit password recovery when only its code is complete', async () => {
    renderLogin()
    fireEvent.click(screen.getByText('Forgot password?'))
    fireEvent.change(screen.getByLabelText('Login ID or Official Email'), { target: { value: '01-2002' } })
    fireEvent.click(screen.getByText('Send Reset Code'))
    await screen.findByLabelText('Verification code digit 1 of 6')
    paste('123456')
    expect(verifyLoginCode).not.toHaveBeenCalled()
    expect(resetPassword).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument()
  })

  it('shows a nonexistent recovery account error beside the identifier field', async () => {
    requestPasswordReset.mockRejectedValueOnce(Object.assign(
      new Error('No account was found for that Login ID or official email.'),
      { code: 'ACCOUNT_NOT_FOUND' },
    ))
    renderLogin()
    fireEvent.click(screen.getByText('Forgot password?'))
    fireEvent.change(screen.getByLabelText('Login ID or Official Email'), { target: { value: '99-9999' } })
    fireEvent.click(screen.getByText('Send Reset Code'))
    expect(await screen.findByText('No account was found for that Login ID or official email.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g., 01-2002 or example@gmail.com'))
      .toHaveAttribute('aria-invalid', 'true')
  })
})
