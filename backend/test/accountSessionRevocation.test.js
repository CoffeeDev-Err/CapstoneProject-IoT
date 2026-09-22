const assert = require('node:assert/strict')
const { it } = require('node:test')
const models = require('../src/models')
const createAccountService = require('../src/services/accountService')

it('revokes active sessions after a supervisor changes sensitive account credentials', async () => {
	const originals = {
		findById: models.User.findById,
		updateMany: models.AuthSession.updateMany,
		createAudit: models.AuditLog.create,
	}
	const revoked = []
	const user = {
		_id: '507f1f77bcf86cd799439011',
		role: 'supervisor',
		username: '00-0001',
		email: 'supervisor@example.org',
		fullName: 'Juan Dela Cruz',
		rank: 'Police Captain',
		status: 'active',
		forcePasswordReset: false,
		save: async () => {},
	}

	models.User.findById = async () => user
	models.AuthSession.updateMany = async (filter, update) => {
		revoked.push({ filter, update })
		return { modifiedCount: 2 }
	}
	models.AuditLog.create = async () => ({})

	try {
		const service = createAccountService({
			io: { emit: () => {}, to: () => ({ emit: () => {} }) },
			personnelService: null,
		})
		await service.updateAccount(user._id, {
			fullName: user.fullName,
			rank: user.rank,
			loginId: user.username,
			officialEmail: 'new.supervisor@example.org',
			temporaryPassword: 'NewSecure!2026',
		}, { actor: { role: 'supervisor', supervisorAuthority: 'primary' } })

		assert.equal(revoked.length, 1)
		assert.equal(revoked[0].filter.userId, user._id)
		assert.equal(revoked[0].filter.revokedAt, null)
		assert.ok(revoked[0].update.$set.revokedAt instanceof Date)
	} finally {
		models.User.findById = originals.findById
		models.AuthSession.updateMany = originals.updateMany
		models.AuditLog.create = originals.createAudit
	}
})
