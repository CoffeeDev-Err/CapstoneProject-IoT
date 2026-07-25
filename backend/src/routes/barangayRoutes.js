const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createBarangayRoutes = (controller) => {
	const router = express.Router()

	router.get('/', asyncHandler(controller.getBarangays))
	router.get('/:code', asyncHandler(controller.getBarangay))

	return router
}

module.exports = createBarangayRoutes
