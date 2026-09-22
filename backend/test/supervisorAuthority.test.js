const assert = require('node:assert/strict')
const { test } = require('node:test')
const models = require('../src/models')
const createAccountService = require('../src/services/accountService')
const { isProtectedAccount } = require('../src/utils/accountProtection')

const primary = { role: 'supervisor', supervisorAuthority: 'primary' }
const delegated = { role: 'supervisor', supervisorAuthority: 'delegated' }
const validSupervisor = {
	fullName: 'Maria Santos',
	rank: 'Police Captain',
	loginId: '12-2004',
	officialEmail: 'maria.santos@pnp.gov.ph',
	temporaryPassword: 'Secure!Pass2026',
}

test('only the primary supervisor may create supervisor accounts', async () => {
	const originalCreate = models.User.create
	const created = []
	models.User.create = async (input) => {
		created.push(input)
		return { ...input, _id: '507f1f77bcf86cd799439011' }
	}
	const service = createAccountService({
		io: { emit: () => {} },
		personnelService: null,
		auditService: { recordAudit: async () => {} },
	})
	try {
		await assert.rejects(
			service.createSupervisorAccount(validSupervisor, { actor: delegated }),
			{ code: 'PRIMARY_SUPERVISOR_REQUIRED' },
		)
		assert.equal(created.length, 0)
		const result = await service.createSupervisorAccount(validSupervisor, { actor: primary })
		assert.equal(result.supervisorAuthority, 'delegated')
		assert.equal(result.forcePasswordReset, true)
		assert.equal(created[0].role, 'supervisor')
		assert.equal(created[0].status, 'active')
	} finally {
		models.User.create = originalCreate
	}
})

test('delegated supervisors cannot edit or deactivate supervisor accounts', async () => {
	const originalFindById = models.User.findById
	models.User.findById = async () => ({
		_id: '507f1f77bcf86cd799439011',
		role: 'supervisor',
		supervisorAuthority: 'delegated',
	})
	const service = createAccountService({ io: {}, personnelService: null })
	try {
		await assert.rejects(service.updateAccount('id', {}, { actor: delegated }), {
			code: 'PRIMARY_SUPERVISOR_REQUIRED',
		})
		await assert.rejects(service.deactivateAccount('id', { actor: delegated }), {
			code: 'PRIMARY_SUPERVISOR_REQUIRED',
		})
		assert.equal(isProtectedAccount(primary), true)
		assert.equal(isProtectedAccount(delegated), false)
	} finally {
		models.User.findById = originalFindById
	}
})

test('primary can deactivate a delegated supervisor and revoke active sessions', async () => {
	const originalFindById = models.User.findById
	const originalUpdateMany = models.AuthSession.updateMany
	const calls = []
	const account = {
		_id: '507f1f77bcf86cd799439011',
		role: 'supervisor',
		supervisorAuthority: 'delegated',
		status: 'active',
		save: async () => {},
	}
	models.User.findById = async () => account
	models.AuthSession.updateMany = async (...args) => { calls.push(args) }
	const service = createAccountService({
		io: { emit: () => {} },
		personnelService: null,
		auditService: { recordAudit: async () => {} },
	})
	try {
		await service.deactivateAccount(account._id, { actor: primary })
		assert.equal(account.status, 'inactive')
		assert.equal(calls.length, 1)
		assert.equal(calls[0][0].userId, account._id)
		account.supervisorAuthority = 'primary'
		await assert.rejects(service.deactivateAccount(account._id, { actor: primary }), {
			code: 'PROTECTED_ACCOUNT',
		})
	} finally {
		models.User.findById = originalFindById
		models.AuthSession.updateMany = originalUpdateMany
	}
})
