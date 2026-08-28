const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const express = require('express')
const request = require('supertest')
const contracts = require('../../contracts/domain-contracts.json')
const createOperationalController = require('../src/controllers/operationalController')
const errorHandler = require('../src/middleware/errorHandler')
const createOperationalRoutes = require('../src/routes/operationalRoutes')

const usersByToken = {
	officer: { id: 'account-officer', role: 'officer', personnelId: 'PNP-CONTRACT-001' },
	unlinked: { id: 'account-unlinked', role: 'officer' },
	supervisor: { id: 'account-supervisor', role: 'supervisor' },
}

const createTestApp = (service) => {
	const app = express()
	app.use(express.json())
	app.use('/api', createOperationalRoutes({
		authService: {
			authenticate: async (token) => {
				const user = usersByToken[token]
				if (!user) {
					const error = new Error('Authentication required.')
					error.status = 401
					throw error
				}
				return { user }
			},
		},
		controller: createOperationalController(service),
	}))
	app.use(errorHandler)
	return app
}

describe('operational HTTP contracts', () => {
	it('retains the deployment list route, payload, and officer actor scope', async () => {
		let receivedActor
		const payload = {
			data: [contracts.apiPayloads.deployment],
			pagination: contracts.apiPayloads.pagination,
		}
		const app = createTestApp({
			listDeployments: async (_query, actor) => {
				receivedActor = actor
				return payload
			},
		})

		const response = await request(app)
			.get('/api/deployments')
			.set('Authorization', 'Bearer officer')
			.expect(200)

		assert.deepEqual(response.body, payload)
		assert.equal(receivedActor.personnelId, 'PNP-CONTRACT-001')
	})

	it('keeps deployment replacement supervisor-only with the existing response shape', async () => {
		const deployments = [contracts.apiPayloads.deployment]
		const app = createTestApp({ replaceDeployments: async () => deployments })

		await request(app)
			.put('/api/deployments')
			.set('Authorization', 'Bearer officer')
			.send({ assignments: deployments })
			.expect(403)

		const response = await request(app)
			.put('/api/deployments')
			.set('Authorization', 'Bearer supervisor')
			.send({ assignments: deployments })
			.expect(200)

		assert.deepEqual(response.body, { success: true, deployments })
	})

	it('rejects operational reads from an officer account without a personnel identity', async () => {
		const app = createTestApp({ listTasks: async () => ({ data: [] }) })
		const response = await request(app)
			.get('/api/tasks')
			.set('Authorization', 'Bearer unlinked')
			.expect(403)

		assert.match(response.body.message, /linked operational identity/i)
	})
})
