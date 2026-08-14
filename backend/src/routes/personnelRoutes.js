const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createPersonnelRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { authenticate, supervisorOnly } = createAuthorization(authService)
	const requireOperationalIdentity = (req, res, next) => {
		if (
			req.auth.user.role === 'supervisor'
			|| (req.auth.user.role === 'officer' && req.auth.user.personnelId)
		) return next()
		return res.status(403).json({
			success: false,
			message: 'A linked operational identity is required.',
		})
	}
	const operationalRead = [authenticate, requireOperationalIdentity]

	router.get('/', ...operationalRead, asyncHandler(controller.getPersonnel))
	router.get('/:personnelId', ...operationalRead, asyncHandler(controller.getPersonnelMember))
	router.patch('/:personnelId/status', ...supervisorOnly, asyncHandler(controller.updateDutyStatus))
	router.get('/:personnelId/location-history', ...supervisorOnly, asyncHandler(controller.getLocationHistory))

	return router
}

module.exports = createPersonnelRoutes
