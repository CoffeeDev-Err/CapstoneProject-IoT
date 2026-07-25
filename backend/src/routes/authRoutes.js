const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')

const createAuthRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)

	router.post('/login', asyncHandler(controller.login))
	router.get('/me', authenticate, asyncHandler(controller.getCurrentUser))
	router.post('/logout', authenticate, asyncHandler(controller.logout))
	router.patch('/password', authenticate, asyncHandler(controller.changePassword))

	return router
}

module.exports = createAuthRoutes
