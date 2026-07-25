const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createNotificationRoutes = (controller) => {
	const router = express.Router()

	router.get('/', asyncHandler(controller.getNotifications))
	router.patch('/read-all', asyncHandler(controller.markAllRead))
	router.patch('/:notificationId/read', asyncHandler(controller.markRead))
	router.delete('/', asyncHandler(controller.clearNotifications))

	return router
}

module.exports = createNotificationRoutes
