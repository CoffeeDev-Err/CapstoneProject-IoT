const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthenticateSession = require('../middleware/authenticateSession')

const createOperationalRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const authenticate = createAuthenticateSession(authService)
	const requireOfficer = (req, res, next) => {
		if (req.auth.user.role !== 'officer' || !req.auth.user.personnelId) {
			return res.status(403).json({
				success: false,
				message: 'A GPS-linked police mobile account is required.',
			})
		}
		return next()
	}
	const officerOnly = [authenticate, requireOfficer]

	router.get(
		'/operations/bootstrap',
		...officerOnly,
		asyncHandler(controller.getBootstrap),
	)
	router.get('/tasks', asyncHandler(controller.getTasks))
	router.post('/tasks', ...officerOnly, asyncHandler(controller.createTask))
	router.get('/tasks/:taskId', asyncHandler(controller.getTask))
	router.post(
		'/tasks/:taskId/accept',
		...officerOnly,
		asyncHandler(controller.acceptTask),
	)
	router.patch('/tasks/:taskId/complete', asyncHandler(controller.completeTask))
	router.get('/reports', asyncHandler(controller.getReports))
	router.post('/reports', ...officerOnly, asyncHandler(controller.submitReport))
	router.get('/reports/:reportId', asyncHandler(controller.getReport))
	router.patch(
		'/reports/:reportId/resolve',
		...officerOnly,
		asyncHandler(controller.resolveReport),
	)
	router.patch('/reports/:reportId/validation', asyncHandler(controller.updateReportValidation))
	router.get('/deployments', asyncHandler(controller.getDeployments))
	router.put('/deployments', asyncHandler(controller.replaceDeployments))
	router.get('/deployments/:assignmentId', asyncHandler(controller.getDeployment))
	router.patch('/deployments/:assignmentId/status', asyncHandler(controller.updateDeploymentStatus))

	return router
}

module.exports = createOperationalRoutes
