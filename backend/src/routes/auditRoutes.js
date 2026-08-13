const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')

const createAuditRoutes = ({ authService, controller }) => {
	const router = express.Router()
	const { supervisorOnly } = createAuthorization(authService)

	router.get('/', ...supervisorOnly, asyncHandler(controller.getAuditLogs))

	return router
}

module.exports = createAuditRoutes
