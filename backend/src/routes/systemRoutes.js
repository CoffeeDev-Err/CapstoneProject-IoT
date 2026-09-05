const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createSystemRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { supervisorOnly } = createAuthorization(authService)

	router.get('/health', controller.getHealth)
	router.get('/ready', asyncHandler(controller.getReadiness))
	router.get('/flespi/devices', ...supervisorOnly, asyncHandler(controller.getFlespiDevices))

	return router
}

module.exports = createSystemRoutes
