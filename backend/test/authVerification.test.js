const assert = require('node:assert/strict')
const { beforeEach, describe, it, mock } = require('node:test')
const { AuditLog, AuthSession, EmailVerification, User } = require('../src/models')
const emailService = require('../src/services/emailService')
const otpRequestLimit = require('../src/services/otpRequestLimit')
// Never send email or connect to MongoDB in these tests.
mock.method(emailService, 'sendVerificationCode', async () => {})
const auth = require('../src/services/authService')
const { hashCode } = require('../src/utils/verification')
const { hashPassword } = require('../src/utils/password')
const errorHandler = require('../src/middleware/errorHandler')
const createRateLimit = require('../src/middleware/rateLimit')

const now = Date.parse('2026-09-08T00:00:00Z')
const oldest = new Date(now - 2 * 60_000)
describe('verification feedback and server deadlines', () => {
  beforeEach((t) => {
    t.mock.method(Date, 'now', () => now)
    t.mock.method(otpRequestLimit, 'reserve', async () => ({ id: 'reservation', userId: 'user', resendAvailableAt: new Date(now).toISOString() }))
    t.mock.method(otpRequestLimit, 'release', async () => {})
    t.mock.method(User, 'findOne', async () => ({ _id: 'user', email: 'officer@example.com' }))
    t.mock.method(EmailVerification, 'countDocuments', async () => 0)
    t.mock.method(EmailVerification, 'findOne', () => ({ sort: async () => ({ createdAt: oldest }) }))
    t.mock.method(EmailVerification, 'updateMany', async () => ({}))
    t.mock.method(EmailVerification, 'create', async (payload) => ({ ...payload, _id: 'new-code' }))
  })

  it('returns the real expiry and allows resend while below the existing quota', async () => {
    const response = await auth.requestPasswordReset({ identifier: '01-2002' })
    assert.equal(response.expiresAt, new Date(now + 600_000).toISOString())
    assert.equal(response.resendAvailableAt, new Date(now).toISOString())
    assert.ok(response.serverTime)
  })

  it('does not send verification codes to a stored email with a known mistyped domain', async (t) => {
    t.mock.method(User, 'findOne', async () => ({ _id: 'user', email: 'officer@ggmail.com' }))
    await assert.rejects(
      auth.requestPasswordReset({ identifier: '01-2002' }),
      { code: 'INVALID_ACCOUNT_EMAIL' },
    )
    assert.equal(EmailVerification.create.mock.callCount(), 0)
  })

  it('rejects reusing the current password during password recovery', async (t) => {
    const challenge = {
      userId: 'user', purpose: 'reset_password', expiresAt: new Date('2099-01-01'),
      attempts: 0, maxAttempts: 5, otpHash: hashCode('123456'), save: async () => {},
    }
    const user = {
      _id: 'user', status: 'active', passwordHash: await hashPassword('StrongPass1!'),
      save: async () => {},
    }
    t.mock.method(EmailVerification, 'findById', () => ({ select: async () => challenge }))
    t.mock.method(User, 'findById', () => ({ select: async () => user }))
    await assert.rejects(
      auth.resetPassword({ challenge_id: 'challenge', code: '123456', new_password: 'StrongPass1!' }),
      { code: 'PASSWORD_REUSED' },
    )
  })

  it('records a successful password reset without storing the password or OTP', async (t) => {
	const audits = []
	const challenge = {
		userId: 'user', purpose: 'reset_password', expiresAt: new Date('2099-01-01'),
		attempts: 0, maxAttempts: 5, otpHash: hashCode('123456'), requestIp: '127.0.0.1',
		save: async () => {},
	}
	const user = {
		_id: 'user', role: 'officer', personnelId: 'PNP-001', status: 'active',
		passwordHash: await hashPassword('OldStrong1!'), save: async () => {},
	}
	t.mock.method(EmailVerification, 'findById', () => ({ select: async () => challenge }))
	t.mock.method(User, 'findById', () => ({ select: async () => user }))
	t.mock.method(AuthSession, 'updateMany', async () => ({ modifiedCount: 1 }))
	t.mock.method(AuditLog, 'create', async (entry) => { audits.push(entry); return entry })

	await auth.resetPassword({
		challenge_id: 'challenge', code: '123456', new_password: 'NewStrong2!',
	})

	assert.equal(audits.length, 1)
	assert.equal(audits[0].action, 'auth.password_reset')
	assert.equal(audits[0].actorPersonnelId, 'PNP-001')
	assert.deepEqual(audits[0].changes, { sessionsRevoked: true })
  })

  it('returns the remaining account window after the third code', async (t) => {
    t.mock.method(otpRequestLimit, 'reserve', async () => ({ id: 'third', resendAvailableAt: new Date(oldest.getTime() + 900_000).toISOString() }))
    const response = await auth.requestPasswordReset({ identifier: '01-2002' })
    assert.equal(response.resendAvailableAt, new Date(oldest.getTime() + 900_000).toISOString())
  })

  it('rejects a fourth request with its retry deadline before creating or invalidating codes', async (t) => {
    t.mock.method(otpRequestLimit, 'reserve', async () => { throw Object.assign(new Error('Limit'), { code: 'OTP_RATE_LIMITED', retryAt: new Date(oldest.getTime() + 900_000).toISOString() }) })
    await assert.rejects(auth.requestPasswordReset({ identifier: '01-2002' }), (error) => {
      assert.equal(error.code, 'OTP_RATE_LIMITED')
      assert.equal(error.retryAt, new Date(oldest.getTime() + 900_000).toISOString())
      return true
    })
    assert.equal(EmailVerification.create.mock.callCount(), 0)
    assert.equal(EmailVerification.updateMany.mock.callCount(), 0)
  })

  for (const [attempts, expectedCode] of [[0, 'INCORRECT_OTP'], [4, 'OTP_ATTEMPTS_EXCEEDED']]) {
    it(`distinguishes ${expectedCode} without treating it as an expired request`, async (t) => {
      const challenge = { purpose: 'login', expiresAt: new Date('2099-01-01'), attempts, maxAttempts: 5,
        otpHash: hashCode('123456'), save: async () => {} }
      t.mock.method(EmailVerification, 'findById', () => ({ select: async () => challenge }))
      await assert.rejects(auth.verifyLogin({ challenge_id: 'id', code: '654321' }), { code: expectedCode })
      assert.equal(challenge.attempts, attempts + 1)
      assert.equal(Boolean(challenge.consumedAt), attempts === 4)
    })
  }

  it('keeps expired and consumed challenges distinguishable', async (t) => {
    const challenge = { purpose: 'login', expiresAt: new Date('2000-01-01') }
    t.mock.method(EmailVerification, 'findById', () => ({ select: async () => challenge }))
    await assert.rejects(auth.verifyLogin({ challenge_id: 'id', code: '123456' }), { code: 'EXPIRED_OTP' })
    challenge.consumedAt = new Date()
    await assert.rejects(auth.verifyLogin({ challenge_id: 'id', code: '123456' }), { code: 'INVALID_OTP' })
  })

  it('preserves retry metadata through the HTTP error handler and route limiter', () => {
    const response = { status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this }, set() {} }
    errorHandler({ status: 429, code: 'OTP_RATE_LIMITED', retryAt: oldest.toISOString() }, {}, response)
    assert.equal(response.body.retryAt, oldest.toISOString())
    assert.ok(response.body.serverTime)
    const limiter = createRateLimit({ keyPrefix: 'otp-feedback-test', max: 0, windowMs: 60_000 })
    limiter({ ip: 'test' }, response, () => assert.fail('Rate limited request must not pass'))
    assert.equal(response.statusCode, 429)
    assert.equal(response.body.retryAt, new Date(now + 60_000).toISOString())
  })
})
