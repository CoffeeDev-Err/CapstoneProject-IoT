const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createPersonnelRoutes = (controller) => {
	const router = express.Router()

	router.get('/', asyncHandler(controller.getPersonnel))
	router.get('/:personnelId', asyncHandler(controller.getPersonnelMember))
	router.patch('/:personnelId/status', asyncHandler(controller.updateDutyStatus))
	router.get('/:personnelId/location-history', asyncHandler(controller.getLocationHistory))

	return router
}

module.exports = createPersonnelRoutes
