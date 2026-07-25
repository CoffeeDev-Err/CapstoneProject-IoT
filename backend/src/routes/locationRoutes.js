const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const requireIngestKey = require('../middleware/requireIngestKey')

const createLocationRoutes = (controller) => {
	const router = express.Router()

	router.post('/ingest', requireIngestKey, asyncHandler(controller.ingestLocation))

	return router
}

module.exports = createLocationRoutes
