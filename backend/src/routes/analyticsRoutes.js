const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createAnalyticsRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { supervisorOnly } = createAuthorization(authService)

	router.get('/operational', ...supervisorOnly, asyncHandler(controller.getOperationalAnalytics))

	return router
}

module.exports = createAnalyticsRoutes
