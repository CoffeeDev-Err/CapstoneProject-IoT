const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')
const createRateLimit = require('../middleware/rateLimit')

const createAuthRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)
	const limitLoginAttempts = createRateLimit({ keyPrefix: 'auth-login', max: 20 })
	const limitRecoveryAttempts = createRateLimit({ keyPrefix: 'auth-recovery', max: 10 })

	router.post('/login', limitLoginAttempts, asyncHandler(controller.login))
	router.post('/login/verify', limitLoginAttempts, asyncHandler(controller.verifyLogin))
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
