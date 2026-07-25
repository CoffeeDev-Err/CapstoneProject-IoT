const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createGpsDeviceRoutes = (controller) => {
	const router = express.Router()

	router.get('/assignments', asyncHandler(controller.getAssignments))

	return router
}

module.exports = createGpsDeviceRoutes
