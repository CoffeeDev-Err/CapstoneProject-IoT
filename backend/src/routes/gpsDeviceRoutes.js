const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createGpsDeviceRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { supervisorOnly } = createAuthorization(authService)

	router.get('/assignments', ...supervisorOnly, asyncHandler(controller.getAssignments))

	return router
}

module.exports = createGpsDeviceRoutes
