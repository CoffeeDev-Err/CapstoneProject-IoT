const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createOperationalRoutes = (controller) => {
	const router = express.Router()

	router.get('/operations/bootstrap', asyncHandler(controller.getBootstrap))
	router.get('/tasks', asyncHandler(controller.getTasks))
	router.post('/tasks', asyncHandler(controller.createTask))
	router.get('/tasks/:taskId', asyncHandler(controller.getTask))
	router.post('/tasks/:taskId/accept', asyncHandler(controller.acceptTask))
	router.patch('/tasks/:taskId/complete', asyncHandler(controller.completeTask))
	router.get('/reports', asyncHandler(controller.getReports))
	router.post('/reports', asyncHandler(controller.submitReport))
	router.get('/reports/:reportId', asyncHandler(controller.getReport))
	router.patch('/reports/:reportId/resolve', asyncHandler(controller.resolveReport))
	router.patch('/reports/:reportId/validation', asyncHandler(controller.updateReportValidation))
	router.get('/deployments', asyncHandler(controller.getDeployments))
	router.put('/deployments', asyncHandler(controller.replaceDeployments))
	router.get('/deployments/:assignmentId', asyncHandler(controller.getDeployment))
	router.patch('/deployments/:assignmentId/status', asyncHandler(controller.updateDeploymentStatus))

	return router
}

module.exports = createOperationalRoutes
