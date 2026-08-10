const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')
const uploadProfilePhoto = require('../middleware/profilePhotoUpload')

const createAccountRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)
	const requireSupervisor = (req, _res, next) => {
		if (req.auth.user.role !== 'supervisor') {
			const error = new Error('Supervisor access is required.')
			error.status = 403
			error.code = 'SUPERVISOR_REQUIRED'
			next(error)
			return
		}
		next()
	}

	router.use(authenticate, requireSupervisor)
	router.get('/', asyncHandler(controller.getAccounts))
	router.post('/', uploadProfilePhoto, asyncHandler(controller.createAccount))
	router.put('/:accountId', uploadProfilePhoto, asyncHandler(controller.updateAccount))
	router.delete('/:accountId', asyncHandler(controller.deactivateAccount))

	return router
}

module.exports = createAccountRoutes
