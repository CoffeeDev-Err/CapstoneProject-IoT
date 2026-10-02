export const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export const deadlineRemaining = (deadline, timing, now = Date.now()) => {
  const target = Date.parse(deadline || '')
  if (!Number.isFinite(target)) return 0
  const serverTime = Date.parse(timing?.serverTime || '')
  const serverNow = Number.isFinite(serverTime) && Number.isFinite(timing?.receivedAt)
    ? serverTime + Math.max(0, now - timing.receivedAt) : now
  return Math.max(0, Math.ceil((target - serverNow) / 1000))
}

export const verificationFeedback = (error) => {
  const code = error?.code
  if (code === 'INVALID_RESET_CODE') {
    return { message: 'The verification code is incorrect or expired. Request a new code if needed.', clearCode: true }
  }
  const incorrect = code === 'INCORRECT_OTP'
    || (code === 'INVALID_OTP' && /incorrect/i.test(error?.message || ''))
  if (incorrect) return { message: 'Incorrect code. Check your email and enter the code again.', clearCode: true }
  if (code === 'EXPIRED_OTP') return { message: 'Code expired. Request a new code to continue.', clearCode: false }
  if (code === 'INVALID_OTP') return { message: 'This code is no longer valid. Request a new code.', clearCode: false }
  if (code === 'OTP_ATTEMPTS_EXCEEDED') return { message: 'Too many incorrect attempts. Request a new code to continue.', clearCode: false }
  if (code === 'NETWORK_ERROR' || code === 'REQUEST_TIMEOUT') {
    return { message: 'Connection problem. Check your connection and try again. Any code you entered has been kept.', clearCode: false }
  }
  return { message: error?.message || 'Unable to complete the request. Please try again.', clearCode: false }
}
