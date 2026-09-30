const assert = require('node:assert/strict')
const { test } = require('node:test')
const models = require('../src/models')
const createAccountService = require('../src/services/accountService')

const actor = { role: 'supervisor', supervisorAuthority: 'primary', username: '00-0001' }
const io = {
	emit: () => {},
	to: () => ({ emit: () => {} }),
}

test('reactivating an officer requires an available GPS device', async () => {
	const originalUserFindById = models.User.findById
	const originalPersonnelFindOne = models.Personnel.findOne
	models.User.findById = async () => ({
		_id: '507f1f77bcf86cd799439012',
		role: 'officer',
		status: 'inactive',
		personnelId: 'officer-p-1001',
		isMockAccount: false,
	})
	models.Personnel.findOne = async () => ({ personnelId: 'officer-p-1001' })
	const service = createAccountService({ io, personnelService: null })

	try {
		await assert.rejects(service.reactivateAccount('id', {}, { actor }), {
			code: 'GPS_DEVICE_REQUIRED',
			field: 'imei',
		})
	} finally {
		models.User.findById = originalUserFindById
		models.Personnel.findOne = originalPersonnelFindOne
	}
})

test('reactivating a mock officer restores access without assigning GPS', async () => {
	const originalUserFindById = models.User.findById
	const originalPersonnelFindOne = models.Personnel.findOne
	const auditEvents = []
	const user = {
		_id: '507f1f77bcf86cd799439013',
		role: 'officer',
		status: 'inactive',
		personnelId: 'mock-officer-1',
		isMockAccount: true,
		username: '11-2004',
		email: 'mock.officer@pnp.gov.ph',
		save: async () => {},
	}
	const profile = {
		personnelId: 'mock-officer-1',
		fullName: 'Mock Officer',
		badgeNumber: 'P-1002',
		rank: 'Patrolman',
		status: 'inactive',
		dutyStatus: 'Off Duty',
		save: async () => {},
	}
	models.User.findById = async () => user
	models.Personnel.findOne = async () => profile
	const service = createAccountService({
		io,
		personnelService: null,
		auditService: { recordAudit: async (event) => auditEvents.push(event) },
	})

	try {
		const result = await service.reactivateAccount('id', {}, { actor })
		assert.equal(user.status, 'active')
		assert.equal(profile.status, 'active')
		assert.equal(profile.dutyStatus, 'Off Duty')
		assert.equal(result.accountStatus, 'Active')
		assert.equal(result.imei, '')
		assert.equal(auditEvents[0].changes.gpsAssigned, false)
	} finally {
		models.User.findById = originalUserFindById
		models.Personnel.findOne = originalPersonnelFindOne
	}
})
