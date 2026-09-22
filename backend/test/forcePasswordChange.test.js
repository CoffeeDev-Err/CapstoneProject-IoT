const assert = require('node:assert/strict')
const { test } = require('node:test')
const express = require('express')
const request = require('supertest')
const createAuthenticateSession = require('../src/middleware/authenticateSession')
const registerSocketGateway = require('../src/runtime/socketGateway')

const authenticateRequest = async ({ role = 'officer', forcePasswordReset = true, baseUrl, path }) => {
	const middleware = createAuthenticateSession({
		authenticate: async () => ({ user: { role, forcePasswordReset } }),
	})
	const request = {
		baseUrl,
		path,
		headers: {},
		get: (name) => name === 'authorization' ? 'Bearer test-token' : '',
	}
	return new Promise((resolve) => middleware(request, {}, resolve))
}

test('first-login officers can reach only account recovery endpoints', async () => {
	for (const path of ['/me', '/logout', '/password/change/request', '/password']) {
		assert.equal(await authenticateRequest({ baseUrl: '/api/auth', path }), undefined)
	}
	const error = await authenticateRequest({ baseUrl: '/api', path: '/reports' })
	assert.equal(error.status, 403)
	assert.equal(error.code, 'PASSWORD_CHANGE_REQUIRED')
})

test('mounted auth route remains available while operational routes are blocked', async () => {
	const app = express()
	const authenticate = createAuthenticateSession({
		authenticate: async () => ({ user: { role: 'officer', forcePasswordReset: true } }),
	})
	const authRouter = express.Router()
	authRouter.get('/me', authenticate, (_req, res) => res.sendStatus(200))
	app.use('/api/auth', authRouter)
	const operationsRouter = express.Router()
	operationsRouter.get('/reports', authenticate, (_req, res) => res.sendStatus(200))
	app.use('/api', operationsRouter)
	app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }))
	await request(app).get('/api/auth/me').set('Authorization', 'Bearer test-token').expect(200)
	await request(app).get('/api/reports').set('Authorization', 'Bearer test-token')
		.expect(403, { code: 'PASSWORD_CHANGE_REQUIRED' })
})

test('only sessions without a temporary password retain operational access', async () => {
	assert.equal(await authenticateRequest({ forcePasswordReset: false, baseUrl: '/api', path: '/reports' }), undefined)
	assert.equal(await authenticateRequest({ role: 'supervisor', forcePasswordReset: false, baseUrl: '/api', path: '/reports' }), undefined)
	const error = await authenticateRequest({ role: 'supervisor', baseUrl: '/api', path: '/reports' })
	assert.equal(error.code, 'PASSWORD_CHANGE_REQUIRED')
})

test('first-login officers cannot receive socket updates before changing password', async () => {
	let socketMiddleware
	registerSocketGateway({
		io: { use: (middleware) => { socketMiddleware = middleware }, on: () => undefined },
		authService: { authenticate: async () => ({ user: { role: 'officer', forcePasswordReset: true } }) },
		operationalService: {},
		personnelService: { getPersonnelWithLocations: () => [], scopePersonnelForActor: () => [] },
		readSessionCookie: () => '',
	})
	const socket = { handshake: { auth: { token: 'test-token' } }, data: {} }
	const error = await new Promise((resolve) => socketMiddleware(socket, resolve))
	assert.equal(error.code, 'PASSWORD_CHANGE_REQUIRED')
})
