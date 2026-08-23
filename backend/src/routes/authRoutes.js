const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')
const createRateLimit = require('../middleware/rateLimit')

const normalizeKeyPart = (value, fallback) => {
	const normalized = String(value || '').trim().toLowerCase()
	return normalized || fallback
}

const createAuthRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)
	const passwordWindowMs = 15 * 60 * 1000
	const otpWindowMs = 10 * 60 * 1000

	// The broad IP ceilings absorb endpoint-wide abuse without making a normal
	// station network share one small allowance. The account/challenge buckets
	// enforce the stricter limits that matter for credential guessing.
	const limitPasswordByIp = createRateLimit({
		keyPrefix: 'auth-password-ip',
		windowMs: passwordWindowMs,
		max: 100,
		skipSuccessfulRequests: true,
	})
	const limitPasswordByAccount = createRateLimit({
		keyPrefix: 'auth-password-account',
		windowMs: passwordWindowMs,
		max: 10,
		keyGenerator: (req) => normalizeKeyPart(req.body?.username, 'missing-login-id'),
		skipSuccessfulRequests: true,
	})
	const limitOtpByIp = createRateLimit({
		keyPrefix: 'auth-otp-ip',
		windowMs: otpWindowMs,
		max: 100,
		skipSuccessfulRequests: true,
	})
	const limitOtpByChallenge = createRateLimit({
		keyPrefix: 'auth-otp-challenge',
		windowMs: otpWindowMs,
		max: 5,
		keyGenerator: (req) => normalizeKeyPart(req.body?.challenge_id, 'missing-challenge-id'),
		skipSuccessfulRequests: true,
	})
	const limitRecoveryAttempts = createRateLimit({ keyPrefix: 'auth-recovery', max: 10 })

	router.post(
		'/login',
		limitPasswordByIp,
		limitPasswordByAccount,
		asyncHandler(controller.login),
	)
	router.post(
		'/login/verify',
		limitOtpByIp,
		limitOtpByChallenge,
		asyncHandler(controller.verifyLogin),
	)
	router.post('/verification/resend', limitRecoveryAttempts, asyncHandler(controller.resendVerification))
	router.post('/password/forgot', limitRecoveryAttempts, asyncHandler(controller.requestPasswordReset))
	router.post('/password/reset', limitRecoveryAttempts, asyncHandler(controller.resetPassword))
	router.get('/me', authenticate, asyncHandler(controller.getCurrentUser))
	router.post('/logout', authenticate, asyncHandler(controller.logout))
	router.post(
		'/password/change/request',
		authenticate,
		asyncHandler(controller.requestPasswordChange),
	)
	router.patch('/password', authenticate, asyncHandler(controller.changePassword))

	return router
}

module.exports = createAuthRoutes
