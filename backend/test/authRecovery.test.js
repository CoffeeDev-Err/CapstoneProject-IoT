const assert = require('node:assert/strict')
const { it } = require('node:test')
const { AuditLog, AuthSession, EmailVerification, User } = require('../src/models')
const auth = require('../src/services/authService')
const { hashCode } = require('../src/utils/verification')
const { hashPassword, verifyPassword } = require('../src/utils/password')

const fixture = async (t) => {
	const challenge = {
		_id: 'challenge', userId: 'user', purpose: 'reset_password',
		expiresAt: new Date('2099-01-01'), consumedAt: null,
		attempts: 0, maxAttempts: 5, otpHash: hashCode('123456'),
	}
	const user = {
		_id: 'user', role: 'officer', status: 'active',
		passwordHash: await hashPassword('OldStrong1!'), forcePasswordReset: true,
	}
	let saves = 0
	t.mock.method(EmailVerification, 'findById', () => ({ select: async () => ({
		...challenge,
		save: async function () { Object.assign(challenge, this) },
	}) }))
	t.mock.method(EmailVerification, 'updateOne', async (filter, update) => {
		assert.equal(filter._id, challenge._id)
		assert.equal(filter.otpHash, challenge.otpHash)
		assert.equal(filter.consumedAt, null)
		if (challenge.consumedAt || challenge.expiresAt <= filter.expiresAt.$gt
			|| challenge.attempts >= filter.attempts.$lt) return { modifiedCount: 0 }
		Object.assign(challenge, update.$set)
		return { modifiedCount: 1 }
	})
	t.mock.method(User, 'findById', () => ({ select: async () => ({
		...user, save: async function () { saves += 1; Object.assign(user, this) },
	}) }))
	t.mock.method(AuthSession, 'updateMany', async () => ({ modifiedCount: 2 }))
	t.mock.method(AuditLog, 'create', async (entry) => entry)
	const reset = (newPassword = 'NewStrong2!', code = '123456') => auth.resetPassword({
		challenge_id: 'challenge', code, new_password: newPassword,
	})
	return { challenge, user, reset, saves: () => saves }
}

it('allows the same correct OTP with a different password after PASSWORD_REUSED, then rejects replay', async (t) => {
	const f = await fixture(t)
	await assert.rejects(f.reset('OldStrong1!'), { code: 'PASSWORD_REUSED' })
	assert.equal(f.challenge.consumedAt, null)
	assert.equal(f.challenge.attempts, 0)
	assert.equal(f.saves(), 0)
	assert.equal(AuthSession.updateMany.mock.callCount(), 0)
	assert.equal(AuditLog.create.mock.callCount(), 0)
	assert.deepEqual(await f.reset(), { success: true })
	assert.ok(f.challenge.consumedAt)
	assert.equal(await verifyPassword('NewStrong2!', f.user.passwordHash), true)
	assert.equal(f.user.forcePasswordReset, false)
	assert.equal(AuthSession.updateMany.mock.callCount(), 1)
	await assert.rejects(f.reset('AnotherStrong3!'), { code: 'INVALID_OTP' })
	assert.equal(f.saves(), 1)
})

it('only one simultaneous reset can consume a correct code and save a password', async (t) => {
	const f = await fixture(t)
	const results = await Promise.allSettled([f.reset(), f.reset('AnotherStrong3!')])
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
	assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'INVALID_OTP')
	assert.equal(f.saves(), 1)
	assert.equal(AuthSession.updateMany.mock.callCount(), 1)
})

it('checks incorrect codes before password reuse and retains the attempt limit', async (t) => {
	const f = await fixture(t)
	for (let index = 0; index < 5; index += 1) {
		await assert.rejects(f.reset('OldStrong1!', '654321'), {
			code: index === 4 ? 'OTP_ATTEMPTS_EXCEEDED' : 'INCORRECT_OTP',
		})
	}
	assert.equal(f.challenge.attempts, 5)
	assert.equal(User.findById.mock.callCount(), 0)
	await assert.rejects(f.reset(), { code: 'INVALID_OTP' })
})

for (const [field, value, code] of [
	['purpose', 'login', 'INVALID_OTP'],
	['expiresAt', new Date('2000-01-01'), 'EXPIRED_OTP'],
	['consumedAt', new Date(), 'INVALID_OTP'],
	['attempts', 5, 'OTP_ATTEMPTS_EXCEEDED'],
]) {
	it(`rejects an invalid recovery challenge (${field}) without updating the password`, async (t) => {
		const f = await fixture(t)
		f.challenge[field] = value
		await assert.rejects(f.reset(), { code })
		assert.equal(f.saves(), 0)
		assert.equal(User.findById.mock.callCount(), 0)
	})
}

it('does not consume the OTP when the new password is weak or the account is inactive', async (t) => {
	const f = await fixture(t)
	await assert.rejects(f.reset('weak'), { code: 'WEAK_PASSWORD' })
	f.user.status = 'inactive'
	await assert.rejects(f.reset(), { code: 'AUTHENTICATION_FAILED' })
	assert.equal(f.challenge.consumedAt, null)
	assert.equal(f.saves(), 0)
})

it('rechecks challenge validity after password validation before writing credentials', async (t) => {
	const f = await fixture(t)
	t.mock.method(EmailVerification, 'updateOne', async () => ({ modifiedCount: 0 }))
	await assert.rejects(f.reset(), { code: 'INVALID_OTP' })
	assert.equal(f.saves(), 0)
	assert.equal(AuthSession.updateMany.mock.callCount(), 0)
})
