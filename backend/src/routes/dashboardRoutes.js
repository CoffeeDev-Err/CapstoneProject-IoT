const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createDashboardRoutes = (controller) => {
	const router = express.Router()

	router.get('/summary', asyncHandler(controller.getDashboardSummary))

	return router
}

module.exports = createDashboardRoutes
