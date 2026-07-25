const { randomBytes, scrypt, timingSafeEqual } = require('crypto')
const { promisify } = require('util')

const scryptAsync = promisify(scrypt)

const hashPassword = async (password) => {
	const salt = randomBytes(16).toString('hex')
	const derivedKey = await scryptAsync(password, salt, 64)
	return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

const isStrongPassword = (password) => (
	password.length >= 10
	&& /[A-Z]/.test(password)
	&& /[a-z]/.test(password)
	&& /\d/.test(password)
	&& /[^A-Za-z0-9]/.test(password)
)

const verifyPassword = async (password, storedHash) => {
	const [algorithm, salt, hash] = String(storedHash || '').split('$')
	if (algorithm !== 'scrypt' || !salt || !hash) return false
	const expected = Buffer.from(hash, 'hex')
	const actual = await scryptAsync(password, salt, expected.length)
	return expected.length === actual.length && timingSafeEqual(expected, actual)
}

module.exports = {
	hashPassword,
	isStrongPassword,
	verifyPassword,
}
