const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createAnalyticsRoutes = (controller) => {
	const router = express.Router()

	router.get('/operational', asyncHandler(controller.getOperationalAnalytics))

	return router
}

module.exports = createAnalyticsRoutes
