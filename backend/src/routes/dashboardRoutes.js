const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createDashboardRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { supervisorOnly } = createAuthorization(authService)

	router.get('/summary', ...supervisorOnly, asyncHandler(controller.getDashboardSummary))

	return router
}

module.exports = createDashboardRoutes
