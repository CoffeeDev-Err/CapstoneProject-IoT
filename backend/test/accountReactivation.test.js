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

test('reactivating an officer reuses a stale active assignment owned by that officer', async () => {
	const originals = {
		userFindById: models.User.findById,
		personnelFindOne: models.Personnel.findOne,
		assignmentFindOne: models.GpsDeviceAssignment.findOne,
		assignmentCreate: models.GpsDeviceAssignment.create,
	}
	const user = {
		_id: '507f1f77bcf86cd799439014',
		role: 'officer',
		status: 'inactive',
		personnelId: 'officer-p-1001',
		isMockAccount: false,
		username: '12-2004',
		email: 'leo@pnp.gov.ph',
		save: async () => {},
	}
	const profile = {
		personnelId: user.personnelId,
		fullName: 'Leo Gannad',
		badgeNumber: 'P-1001',
		rank: 'Police Corporal',
		status: 'inactive',
		dutyStatus: 'Off Duty',
		save: async () => {},
	}
	let assignmentSaves = 0
	const staleAssignment = {
		_id: '507f1f77bcf86cd799439015',
		assignmentId: 'GPS-STALE-002',
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
	models.GpsDeviceAssignment.findOne = async () => staleAssignment
	models.GpsDeviceAssignment.create = async () => {
		throw new Error('A new assignment must not be created for the same officer and device.')
	}

	const service = createAccountService({
		io,
		personnelService: null,
		auditService: { recordAudit: async () => {} },
		fetchRegisteredDevices: async () => [{ id: 'device-2', imei: '7026287492', name: 'GPS-002' }],
	})

	try {
		const result = await service.reactivateAccount('id', {
			imei: '7026287492',
			flespiDeviceId: 'device-2',
		}, { actor })
		assert.equal(user.status, 'active')
		assert.equal(profile.status, 'active')
		assert.equal(result.flespiDeviceName, 'GPS-002')
		assert.equal(assignmentSaves, 1)
	} finally {
		models.User.findById = originals.userFindById
		models.Personnel.findOne = originals.personnelFindOne
		models.GpsDeviceAssignment.findOne = originals.assignmentFindOne
		models.GpsDeviceAssignment.create = originals.assignmentCreate
	}
})

test('reactivating an officer rejects a GPS device assigned to another officer', async () => {
	const originals = {
		userFindById: models.User.findById,
		personnelFindOne: models.Personnel.findOne,
		assignmentFindOne: models.GpsDeviceAssignment.findOne,
	}
	models.User.findById = async () => ({
		_id: '507f1f77bcf86cd799439016',
		role: 'officer',
		status: 'inactive',
		personnelId: 'officer-p-1001',
		isMockAccount: false,
	})
	models.Personnel.findOne = async () => ({ personnelId: 'officer-p-1001' })
	models.GpsDeviceAssignment.findOne = async (filter) => (
		filter.$or
			? { personnelId: 'officer-p-2002', imei: '7026287492', flespiDeviceId: 'device-2' }
			: null
	)
	const service = createAccountService({
		io,
		personnelService: null,
		fetchRegisteredDevices: async () => [{ id: 'device-2', imei: '7026287492', name: 'GPS-002' }],
	})

	try {
		await assert.rejects(service.reactivateAccount('id', {
			imei: '7026287492',
			flespiDeviceId: 'device-2',
		}, { actor }), { code: 'GPS_DEVICE_ASSIGNED' })
	} finally {
		models.User.findById = originals.userFindById
		models.Personnel.findOne = originals.personnelFindOne
		models.GpsDeviceAssignment.findOne = originals.assignmentFindOne
	}
})
