const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')

const createAccountRoutes = (controller) => {
	const router = express.Router()

	router.get('/', asyncHandler(controller.getAccounts))
	router.post('/', asyncHandler(controller.createAccount))
	router.put('/:accountId', asyncHandler(controller.updateAccount))
	router.delete('/:accountId', asyncHandler(controller.deactivateAccount))

	return router
}

module.exports = createAccountRoutes
