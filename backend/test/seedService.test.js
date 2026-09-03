const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
	migrateProvisionedLoginId,
	requireProvisionedLoginId,
} = require('../src/services/seedService')

describe('provisioned account Login ID migration', () => {
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
