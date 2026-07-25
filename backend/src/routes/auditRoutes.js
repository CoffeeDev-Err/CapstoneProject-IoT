const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createAuditRoutes = (controller) => {
	const router = express.Router()

	router.get('/', asyncHandler(controller.getAuditLogs))

	return router
}

module.exports = createAuditRoutes
