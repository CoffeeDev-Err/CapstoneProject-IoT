const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
	configureDemoGpsAssignment,
	findProvisionedSupervisor,
	migrateProvisionedLoginId,
	requireProvisionedLoginId,
} = require('../src/services/seedService')

describe('demo GPS assignment', () => {
	const originalEnv = {
		deviceId: process.env.DEMO_GPS_FLESPI_DEVICE_ID,
		deviceIdent: process.env.DEMO_GPS_DEVICE_IDENT,
		deviceName: process.env.DEMO_GPS_DEVICE_NAME,
	}

	const restoreEnv = () => {
		for (const [key, value] of Object.entries({
			DEMO_GPS_FLESPI_DEVICE_ID: originalEnv.deviceId,
			DEMO_GPS_DEVICE_IDENT: originalEnv.deviceIdent,
			DEMO_GPS_DEVICE_NAME: originalEnv.deviceName,
		})) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}

	it('does not overwrite a demo device assigned to another officer', async () => {
		process.env.DEMO_GPS_FLESPI_DEVICE_ID = 'device-1'
		process.env.DEMO_GPS_DEVICE_IDENT = 'imei-1'
		process.env.DEMO_GPS_DEVICE_NAME = 'GPS-001'
		let updated = false
		const model = {
			findOne: () => ({ lean: async () => ({ personnelId: 'officer-other' }) }),
			updateOne: async () => { updated = true },
		}

		try {
			await configureDemoGpsAssignment('officer-demo', model)
			assert.equal(updated, false)
		} finally {
			restoreEnv()
		}
	})

	it('does not replace another active device owned by the demo officer', async () => {
		process.env.DEMO_GPS_FLESPI_DEVICE_ID = 'device-1'
		process.env.DEMO_GPS_DEVICE_IDENT = 'imei-1'
		process.env.DEMO_GPS_DEVICE_NAME = 'GPS-001'
		let queryCount = 0
		let updated = false
		const model = {
			findOne: () => ({
				lean: async () => {
					queryCount += 1
					return queryCount === 1 ? null : {
						personnelId: 'officer-demo',
						flespiDeviceId: 'device-2',
						imei: 'imei-2',
						deviceName: 'GPS-002',
					}
				},
			}),
			updateOne: async () => { updated = true },
		}

		try {
			await configureDemoGpsAssignment('officer-demo', model)
			assert.equal(updated, false)
		} finally {
			restoreEnv()
		}
	})
})

describe('provisioned account Login ID migration', () => {
	it('keeps the designated primary account when delegated supervisors also exist', async () => {
		const primary = { username: '00-0001', role: 'supervisor', supervisorAuthority: 'primary' }
		const userModel = {
			findOne: async (query) => query.supervisorAuthority === 'primary' ? primary : null,
			find: () => { throw new Error('Fallback must not run after primary designation.') },
		}
		const result = await findProvisionedSupervisor({
			username: '12-2004', email: 'delegated@example.org',
		}, userModel)
		assert.equal(result, primary)
	})
	it('falls back to the single existing supervisor before creating another account', async () => {
		const legacySupervisor = { username: 'supervisor', role: 'supervisor' }
		const userModel = {
			findOne: async () => null,
			find: () => ({ limit: async () => [legacySupervisor] }),
		}

		const existing = await findProvisionedSupervisor({
			username: '00-0001',
			email: 'configured@example.com',
		}, userModel)

		assert.equal(existing, legacySupervisor)
	})

	it('stops instead of guessing when multiple unmatched supervisors exist', async () => {
		const userModel = {
			findOne: async () => null,
			find: () => ({
				limit: async () => [{ username: 'first' }, { username: 'second' }],
			}),
		}

		await assert.rejects(
			findProvisionedSupervisor({
				username: '00-0001',
				email: 'configured@example.com',
			}, userModel),
			/Multiple supervisor accounts/,
		)
	})

	it('accepts only the canonical NN-NNNN format', () => {
		assert.doesNotThrow(() => requireProvisionedLoginId('00-0001', 'SUPERVISOR_LOGIN_ID'))
		assert.throws(
			() => requireProvisionedLoginId('supervisor', 'SUPERVISOR_LOGIN_ID'),
			/NN-NNNN/,
		)
	})

	it('preserves the account and changes only its available Login ID', async () => {
		const user = { _id: 'supervisor-id', username: 'supervisor', role: 'supervisor' }
		const userModel = {
			findOne: () => ({
				select: () => ({ lean: async () => null }),
			}),
		}

		const changed = await migrateProvisionedLoginId(
			user,
			'00-0001',
			'supervisor',
			userModel,
		)

		assert.equal(changed, true)
		assert.equal(user.username, '00-0001')
		assert.equal(user._id, 'supervisor-id')
	})

	it('refuses to take a Login ID already owned by another account', async () => {
		const userModel = {
			findOne: () => ({
				select: () => ({ lean: async () => ({ _id: 'another-account' }) }),
			}),
		}

		await assert.rejects(
			migrateProvisionedLoginId(
				{ _id: 'supervisor-id', username: 'supervisor', role: 'supervisor' },
				'00-0001',
				'supervisor',
				userModel,
			),
			/already assigned/,
		)
	})
})
