const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createNotificationRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { officerOnly, supervisorOnly } = createAuthorization(authService)
	const requireOfficer = (req, res, next) => {
		if (req.auth.user.role !== 'officer' || !req.auth.user.personnelId) {
			return res.status(403).json({
				success: false,
				message: 'A police mobile account is required.',
			})
		}
		return next()
	}
	const authenticatedOfficerOnly = [...officerOnly, requireOfficer]

	router.get('/me', ...authenticatedOfficerOnly, asyncHandler(controller.getMyNotifications))
	router.patch(
		'/me/read-all',
		...authenticatedOfficerOnly,
		asyncHandler(controller.markAllMyNotificationsRead),
	)
	router.patch(
		'/me/:notificationId/read',
		...authenticatedOfficerOnly,
		asyncHandler(controller.markMyNotificationRead),
	)
	router.post('/devices', ...authenticatedOfficerOnly, asyncHandler(controller.registerPushDevice))
	router.delete('/devices', ...authenticatedOfficerOnly, asyncHandler(controller.unregisterPushDevice))

	router.get('/', ...supervisorOnly, asyncHandler(controller.getNotifications))
	router.patch('/read-all', ...supervisorOnly, asyncHandler(controller.markAllRead))
	router.patch('/:notificationId/read', ...supervisorOnly, asyncHandler(controller.markRead))
	router.delete('/', ...supervisorOnly, asyncHandler(controller.clearNotifications))

	return router
}

module.exports = createNotificationRoutes
