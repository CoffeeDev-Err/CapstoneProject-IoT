const assert = require('node:assert/strict')
const http = require('node:http')
const { test } = require('node:test')
const express = require('express')
const createAuthRoutes = require('../src/routes/authRoutes')

test('limits five failed password attempts for the same normalized Login ID', async () => {
	let controllerCalls = 0
	const app = express()
	app.use(express.json())
	app.use('/api/auth', createAuthRoutes({
		authService: {},
		controller: {
			login: async (_req, res) => {
				controllerCalls += 1
				res.status(401).json({ code: 'AUTHENTICATION_FAILED' })
			},
		},
	}))
	const server = http.createServer(app)
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	try {
		const { port } = server.address()
		const statuses = []
		let finalResponse
		for (let attempt = 0; attempt < 6; attempt += 1) {
			finalResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username: attempt % 2 ? ' 01-2002 ' : '01-2002' }),
			})
			statuses.push(finalResponse.status)
		}
		assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429])
		assert.equal(controllerCalls, 5)
		assert.equal(finalResponse.headers.get('ratelimit-limit'), '5')
		assert.ok(finalResponse.headers.get('retry-after'))
		const payload = await finalResponse.json()
		assert.equal(payload.code, 'RATE_LIMITED')
		assert.ok(payload.retryAt)
		assert.ok(payload.serverTime)
	} finally {
		await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
	}
})
