import { useRef } from 'react'

const CODE_LENGTH = 6

function VerificationCodeInput({ value, onChange, autoFocus = false, invalid = false }) {
  const inputRefs = useRef([])
  const digits = String(value || '').padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('')

  const setCode = (nextValue, focusIndex) => {
    onChange(nextValue.replace(/\D/g, '').slice(0, CODE_LENGTH))
    if (Number.isInteger(focusIndex)) {
      requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus())
    }
  }

  const handleChange = (index, rawValue) => {
    const enteredDigits = rawValue.replace(/\D/g, '')
    if (!enteredDigits) {
      const nextValue = value.slice(0, index) + value.slice(index + 1)
      setCode(nextValue, Math.min(index, CODE_LENGTH - 1))
      return
    }

    const nextDigits = digits.map((digit) => digit.trim())
    enteredDigits.slice(0, CODE_LENGTH - index).split('').forEach((digit, offset) => {
      nextDigits[index + offset] = digit
    })
    const nextValue = nextDigits.join('').slice(0, CODE_LENGTH)
    setCode(nextValue, Math.min(index + enteredDigits.length, CODE_LENGTH - 1))
  }

  const handleKeyDown = (event, index) => {
    if (event.key === 'Backspace' && !digits[index].trim() && index > 0) {
      event.preventDefault()
      setCode(value.slice(0, index - 1) + value.slice(index), index - 1)
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (event) => {
    const pastedCode = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pastedCode) return
    event.preventDefault()
    setCode(pastedCode, Math.min(pastedCode.length, CODE_LENGTH - 1))
  }

  return (
    <fieldset className="verification-code-field">
      <legend className="login-label">Verification Code</legend>
      <div
        className={`verification-code-inputs ${invalid ? 'verification-code-inputs--invalid' : ''}`}
        onPaste={handlePaste}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => { inputRefs.current[index] = element }}
            type="text"
            className="verification-code-digit"
            inputMode="numeric"
            pattern="[0-9]*"
            value={digit.trim()}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onFocus={(event) => event.target.select()}
            maxLength={index === 0 ? CODE_LENGTH : 1}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && index === 0}
            aria-label={`Verification code digit ${index + 1} of ${CODE_LENGTH}`}
            aria-invalid={invalid}
          />
        ))}
      </div>
    </fieldset>
  )
}

export default VerificationCodeInput
