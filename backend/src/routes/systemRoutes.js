const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createSystemRoutes = (controller) => {
	const router = express.Router()

	router.get('/health', controller.getHealth)
	router.get('/flespi/devices', asyncHandler(controller.getFlespiDevices))

	return router
}

module.exports = createSystemRoutes
