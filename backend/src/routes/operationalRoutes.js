const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')
const uploadReportEvidence = require('../middleware/reportEvidenceUpload')

const createOperationalRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { authenticate, officerOnly, supervisorOnly } = createAuthorization(authService)
	const requireOfficer = (req, res, next) => {
		if (req.auth.user.role !== 'officer' || !req.auth.user.personnelId) {
			return res.status(403).json({
				success: false,
				message: 'A GPS-linked police mobile account is required.',
			})
		}
		return next()
	}
	const authenticatedOfficerOnly = [...officerOnly, requireOfficer]
	const requireSupervisor = (req, res, next) => {
		if (req.auth.user.role !== 'supervisor') {
			return res.status(403).json({
				success: false,
				message: 'Supervisor access required.',
			})
		}
		return next()
	}
	const authenticatedSupervisorOnly = [...supervisorOnly, requireSupervisor]

	router.get(
		'/operations/bootstrap',
		...authenticatedOfficerOnly,
		asyncHandler(controller.getBootstrap),
	)
	router.get('/tasks', authenticate, asyncHandler(controller.getTasks))
	router.post('/tasks', ...authenticatedOfficerOnly, asyncHandler(controller.createTask))
	router.get('/tasks/:taskId', authenticate, asyncHandler(controller.getTask))
	router.post(
		'/tasks/:taskId/accept',
		...authenticatedOfficerOnly,
		asyncHandler(controller.acceptTask),
	)
	router.patch(
		'/tasks/:taskId/cancel',
		...authenticatedOfficerOnly,
		asyncHandler(controller.cancelTask),
	)
	router.patch('/tasks/:taskId/complete', ...authenticatedSupervisorOnly, asyncHandler(controller.completeTask))
	router.get('/reports', authenticate, asyncHandler(controller.getReports))
	router.post(
		'/reports',
		...authenticatedOfficerOnly,
		uploadReportEvidence,
		asyncHandler(controller.submitReport),
	)
	router.get(
		'/reports/:reportId/route',
		...authenticatedSupervisorOnly,
		asyncHandler(controller.getReportRoute),
	)
	router.get('/reports/:reportId', authenticate, asyncHandler(controller.getReport))
	router.patch(
		'/reports/:reportId/resolve',
		...authenticatedOfficerOnly,
		asyncHandler(controller.resolveReport),
	)
	router.patch(
		'/reports/:reportId/validation',
		...authenticatedSupervisorOnly,
		asyncHandler(controller.updateReportValidation),
	)
	router.get('/deployments', authenticate, asyncHandler(controller.getDeployments))
	router.put('/deployments', ...authenticatedSupervisorOnly, asyncHandler(controller.replaceDeployments))
	router.get('/deployments/:assignmentId', authenticate, asyncHandler(controller.getDeployment))
	router.patch(
		'/deployments/:assignmentId/acknowledge',
		...authenticatedOfficerOnly,
		asyncHandler(controller.acknowledgeDeployment),
	)
	router.patch('/deployments/:assignmentId/status', ...authenticatedSupervisorOnly, asyncHandler(controller.updateDeploymentStatus))

	return router
}

module.exports = createOperationalRoutes
