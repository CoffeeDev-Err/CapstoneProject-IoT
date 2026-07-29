const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')

const createAuthRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)

	router.post('/login', asyncHandler(controller.login))
	router.post('/login/verify', asyncHandler(controller.verifyLogin))
	router.post('/verification/resend', asyncHandler(controller.resendVerification))
	router.post('/password/forgot', asyncHandler(controller.requestPasswordReset))
	router.post('/password/reset', asyncHandler(controller.resetPassword))
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
