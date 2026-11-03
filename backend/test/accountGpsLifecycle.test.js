const assert = require('node:assert/strict')
const { test } = require('node:test')
const models = require('../src/models')
const createAccountService = require('../src/services/accountService')

const actor = { role: 'supervisor', supervisorAuthority: 'primary', username: '00-0001' }
const io = { emit: () => {}, to: () => ({ emit: () => {} }) }

test('editing an officer to inactive releases the active GPS assignment', async () => {
	const originals = {
		userFindById: models.User.findById,
		personnelFindOne: models.Personnel.findOne,
		assignmentFindOne: models.GpsDeviceAssignment.findOne,
		authUpdateMany: models.AuthSession.updateMany,
		deploymentUpdateMany: models.Deployment.updateMany,
		taskUpdateMany: models.Task.updateMany,
		reportUpdateMany: models.Report.updateMany,
	}
	const user = {
		_id: '507f1f77bcf86cd799439021',
		role: 'officer',
		status: 'active',
		personnelId: 'officer-p-1001',
		isMockAccount: false,
		username: '12-2004',
		email: 'leo@pnp.gov.ph',
		forcePasswordReset: false,
		save: async () => {},
	}
	const profile = {
		personnelId: user.personnelId,
		fullName: 'Leo Gannad',
		badgeNumber: 'P-1001',
		rank: 'Police Corporal',
		mobileNumber: '',
		status: 'active',
		dutyStatus: 'Off Duty',
		save: async () => {},
	}
	let assignmentSaves = 0
	const assignment = {
		personnelId: user.personnelId,
		flespiDeviceId: 'device-2',
		imei: '7026287492',
		deviceName: 'GPS-002',
		status: 'active',
		unassignedAt: null,
		save: async () => { assignmentSaves += 1 },
	}
	models.User.findById = async () => user
	models.Personnel.findOne = async () => profile
	models.GpsDeviceAssignment.findOne = async () => assignment
	models.AuthSession.updateMany = async () => ({ modifiedCount: 1 })
	models.Deployment.updateMany = async () => ({ modifiedCount: 0 })
	models.Task.updateMany = async () => ({ modifiedCount: 0 })
	models.Report.updateMany = async () => ({ modifiedCount: 0 })
	const service = createAccountService({
		io,
		personnelService: null,
		auditService: { recordAudit: async () => {} },
	})

	try {
		const result = await service.updateAccount(user._id, {
			fullName: profile.fullName,
			badgeNumber: profile.badgeNumber,
			rank: profile.rank,
			loginId: user.username,
			officialEmail: user.email,
			mobileNumber: '',
			accountStatus: 'inactive',
		}, { actor })
		assert.equal(user.status, 'inactive')
		assert.equal(profile.status, 'inactive')
		assert.equal(assignment.status, 'released')
		assert.ok(assignment.unassignedAt instanceof Date)
		assert.equal(assignmentSaves, 1)
		assert.equal(result.imei, '')
	} finally {
		models.User.findById = originals.userFindById
		models.Personnel.findOne = originals.personnelFindOne
		models.GpsDeviceAssignment.findOne = originals.assignmentFindOne
		models.AuthSession.updateMany = originals.authUpdateMany
		models.Deployment.updateMany = originals.deploymentUpdateMany
		models.Task.updateMany = originals.taskUpdateMany
		models.Report.updateMany = originals.reportUpdateMany
	}
})
