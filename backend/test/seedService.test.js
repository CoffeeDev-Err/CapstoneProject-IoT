const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
	findProvisionedSupervisor,
	migrateProvisionedLoginId,
	requireProvisionedLoginId,
} = require('../src/services/seedService')

describe('provisioned account Login ID migration', () => {
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
