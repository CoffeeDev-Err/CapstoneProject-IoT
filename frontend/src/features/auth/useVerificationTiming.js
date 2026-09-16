import { useEffect, useState } from 'react'
import { deadlineRemaining, formatCountdown } from './verificationFeedback'

export function useVerificationTiming(challenge, retry) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!challenge && !retry) return
    // Recalculate from timestamps so backgrounding does not pause the countdown.
    const deadlines = [
      { value: challenge?.resendAvailableAt, timing: challenge },
      { value: challenge?.expiresAt, timing: challenge },
      { value: retry?.retryAt, timing: retry },
    ].filter(({ value }) => value)
    const timer = setInterval(() => {
      const nextNow = Date.now()
      setNow(nextNow)
      if (deadlines.every(({ value, timing }) => deadlineRemaining(
        value,
        timing,
        nextNow,
      ) === 0)) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [challenge, retry])
  const resendSeconds = Math.max(
    deadlineRemaining(challenge?.resendAvailableAt, challenge, now),
    deadlineRemaining(retry?.retryAt, retry, now),
  )
  const expiresSeconds = deadlineRemaining(challenge?.expiresAt, challenge, now)
  return {
    resendSeconds,
    resendLabel: resendSeconds ? `Resend code in ${formatCountdown(resendSeconds)}` : 'Resend code',
    expirationLabel: challenge?.expiresAt
      ? expiresSeconds ? `Code expires in ${formatCountdown(expiresSeconds)}` : 'Code expired. Request a new code.'
      : '',
  }
}
