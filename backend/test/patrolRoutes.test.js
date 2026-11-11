const { it } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const request = require('supertest')
const routes = require('../src/routes/patrolRoutes')
const errorHandler = require('../src/middleware/errorHandler')
it('restricts weekly crew management to supervisors and validates a roster before writing', async () => {
	let writes = 0
	const app = express()
	app.use(express.json())
	app.use('/api/patrol', routes({ authService: { authenticate: async token => {
		if (!token) { const error = new Error('Authentication required'); error.status = 401; throw error }
		return { user: { id: 'actor', role: token } }
	} },
		models: { FleetWeek: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }), create: async () => { writes++; return {} } },
			Personnel: { find: () => ({ select: () => ({ lean: async () => [] }) }) } } }))
	app.use(errorHandler)
	await request(app).get('/api/patrol/fleet').expect(401)
	await request(app).get('/api/patrol/fleet').set('Authorization', 'Bearer officer').expect(403)
	const response = await request(app).get('/api/patrol/fleet').set('Authorization', 'Bearer supervisor').expect(200)
	assert.equal(response.body.vehicles.length, 3)
	await request(app).post('/api/patrol/fleet').set('Authorization', 'Bearer supervisor').send({ weekStart: '2026-11-10', crews: [] }).expect(400)
	assert.equal(writes, 0)
})
