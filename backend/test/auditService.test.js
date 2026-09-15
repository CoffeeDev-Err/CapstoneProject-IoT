const assert = require('node:assert/strict')
const { after, before, it } = require('node:test')
const { AuditLog } = require('../src/models')
const auditService = require('../src/services/auditService')

const originalCreate = AuditLog.create

before(() => {
	AuditLog.create = async (entry) => entry
})

after(() => {
	AuditLog.create = originalCreate
})

it('records actor and entity identifiers while removing secrets from audit details', async () => {
	const entry = await auditService.recordAudit({
		actor: { _id: 'user-1', role: 'officer', personnelId: 'PNP-001' },
		action: 'AUTH.PASSWORD_CHANGED',
		entityType: 'USER',
		entityId: 'user-1',
		ipAddress: '127.0.0.1',
		changes: {
			deviceName: 'Android phone',
			password: 'must-not-be-stored',
			otpCode: '123456',
			nested: { accessToken: 'secret', status: 'completed' },
		},
	})

	assert.equal(entry.actorUserId, 'user-1')
	assert.equal(entry.actorRole, 'officer')
	assert.equal(entry.actorPersonnelId, 'PNP-001')
	assert.equal(entry.action, 'auth.password_changed')
	assert.equal(entry.entityType, 'user')
	assert.equal(entry.changes.deviceName, 'Android phone')
	assert.equal(entry.changes.password, undefined)
	assert.equal(entry.changes.otpCode, undefined)
	assert.deepEqual(entry.changes.nested, { status: 'completed' })
})
