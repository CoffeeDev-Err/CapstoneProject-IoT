const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')

const createNotificationRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)
	const requireOfficer = (req, res, next) => {
		if (req.auth.user.role !== 'officer' || !req.auth.user.personnelId) {
			return res.status(403).json({
				success: false,
				message: 'A police mobile account is required.',
			})
		}
		return next()
	}
	const officerOnly = [authenticate, requireOfficer]

	router.get('/me', ...officerOnly, asyncHandler(controller.getMyNotifications))
	router.patch(
		'/me/read-all',
		...officerOnly,
		asyncHandler(controller.markAllMyNotificationsRead),
	)
	router.patch(
		'/me/:notificationId/read',
		...officerOnly,
		asyncHandler(controller.markMyNotificationRead),
	)
	router.post('/devices', ...officerOnly, asyncHandler(controller.registerPushDevice))
	router.delete('/devices', ...officerOnly, asyncHandler(controller.unregisterPushDevice))

	router.get('/', asyncHandler(controller.getNotifications))
	router.patch('/read-all', asyncHandler(controller.markAllRead))
	router.patch('/:notificationId/read', asyncHandler(controller.markRead))
	router.delete('/', asyncHandler(controller.clearNotifications))

	return router
}

module.exports = createNotificationRoutes
