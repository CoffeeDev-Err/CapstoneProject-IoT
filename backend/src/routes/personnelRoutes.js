const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createPersonnelRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { authenticate, supervisorOnly } = createAuthorization(authService)

	router.get('/', authenticate, asyncHandler(controller.getPersonnel))
	router.get('/:personnelId', authenticate, asyncHandler(controller.getPersonnelMember))
	router.patch('/:personnelId/status', ...supervisorOnly, asyncHandler(controller.updateDutyStatus))
	router.get('/:personnelId/location-history', ...supervisorOnly, asyncHandler(controller.getLocationHistory))

	return router
}

module.exports = createPersonnelRoutes
