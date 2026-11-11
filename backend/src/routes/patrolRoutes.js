const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const createAuthorization = require('../middleware/authorization')
const { createFleetService } = require('../services/fleetService')
const { loadBarangayBoundaries, searchPatrolPlaces, getPatrolDirections } = require('../services/patrolMapService')

module.exports = ({ authService, models }) => {
	const router = express.Router()
	const { authenticate, requireRole } = createAuthorization(authService)
	const requireSupervisor = requireRole('supervisor')
	const fleet = createFleetService(models)
	router.use(authenticate)
	router.get('/boundaries', asyncHandler(async (_req, res) => {
		try { res.json(await loadBarangayBoundaries()) }
		catch { res.status(503).json({ message: 'Barangay boundaries could not be loaded. Try again later; custom pin-and-radius coverage remains available.' }) }
	}))
	router.get('/places', requireSupervisor, asyncHandler(async (req, res) => res.json({ places: await searchPatrolPlaces(req.query.q) })))
	router.post('/directions', asyncHandler(async (req, res) => res.json(await getPatrolDirections(req.body))))
	router.get('/fleet', requireSupervisor, asyncHandler(async (_req, res) => res.json(await fleet.list())))
	router.post('/fleet', requireSupervisor, asyncHandler(async (req, res) => res.status(201).json(await fleet.create(req.body, req.auth.user))))
	return router
}
