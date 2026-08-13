const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createBarangayRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { authenticate } = createAuthorization(authService)

	router.use(authenticate)
	router.get('/', asyncHandler(controller.getBarangays))
	router.get('/:code', asyncHandler(controller.getBarangay))

	return router
}

module.exports = createBarangayRoutes
