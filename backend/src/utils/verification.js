const {
	createHmac,
	randomInt,
	timingSafeEqual,
} = require('crypto')

const createCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

const getOtpSecret = () => {
	const secret = process.env.OTP_SECRET || process.env.GPS_INGEST_API_KEY
	if (secret) return secret
	if (process.env.NODE_ENV === 'production') {
		throw new Error('OTP_SECRET is required in production.')
	}
	return 'bantaycabagan-local-development-only'
}

const hashCode = (code) => (
	createHmac('sha256', getOtpSecret())
		.update(String(code || ''))
		.digest('hex')
)

const verifyCodeHash = (code, expectedHash) => {
	const actual = Buffer.from(hashCode(code), 'hex')
	const expected = Buffer.from(String(expectedHash || ''), 'hex')
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const maskEmail = (email) => {
	const [localPart = '', domain = ''] = String(email || '').split('@')
	if (!localPart || !domain) return ''
	const visible = localPart.slice(0, Math.min(2, localPart.length))
	return `${visible}${'*'.repeat(Math.max(2, localPart.length - visible.length))}@${domain}`
}

module.exports = {
	createCode,
	hashCode,
	maskEmail,
	verifyCodeHash,
}
