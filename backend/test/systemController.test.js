const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const express = require('express')
const request = require('supertest')
const createSystemController = require('../src/controllers/systemController')

const appFor = (checkDatabase) => {
	const app = express()
	const controller = createSystemController({}, { checkDatabase })
	app.get('/health', controller.getHealth)
	app.get('/ready', controller.getReadiness)
	return app
}
describe('liveness and database readiness', () => {
	it('keeps liveness separate when the database is disconnected', async () => {
		const app = appFor(async () => false)
		await request(app).get('/health').expect(200)
		const response = await request(app).get('/ready').expect(503)
		assert.equal(response.body.database, 'unavailable')
		assert.equal(response.headers['cache-control'], 'no-store')
	})
	it('requires a successful dependency check', async () => {
		await request(appFor(async () => true)).get('/ready').expect(200)
		const response = await request(appFor(async () => { throw new Error('private database detail') })).get('/ready').expect(503)
		assert.equal(JSON.stringify(response.body).includes('private'), false)
	})
	it('times out an unresponsive dependency', async () => {
		await request(appFor(() => new Promise(() => {}))).get('/ready').expect(503)
	})
})
