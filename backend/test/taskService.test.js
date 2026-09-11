const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createTaskService = require('../src/services/operations/taskService')

const createService = ({ deploymentExists = false, task = null } = {}) => createTaskService({
	io: {
		emit: () => {},
		to: () => ({ emit: () => {} }),
	},
	models: {
		Deployment: {
			exists: async () => deploymentExists,
			distinct: async () => [],
		},
		Task: {
			findOne: async () => task,
			findOneAndUpdate: async () => null,
		},
	},
	loadPersonnelMap: async () => new Map(),
	personnelService: { getPersonnelMember: async () => null },
	notificationService: {
		createNotification: async () => {},
		deliverNotification: async () => {},
	},
})

const createBackupFixture = ({ existingRequest = false } = {}) => {
	const now = new Date('2026-09-11T08:00:00Z')
	const tasks = []
	let sequence = 0
	const Task = {
		exists: async (filter) => existingRequest || tasks.some((task) => (
			task.type === filter.type
			&& task.requestedBy === filter.requestedBy
			&& ['open', 'full'].includes(task.status)
		)),
		create: async (payload) => {
			await new Promise((resolve) => setImmediate(resolve))
			if (tasks.some((task) => task.activeRequestKey === payload.activeRequestKey)) {
				const error = new Error('duplicate active request')
				error.code = 11000
				error.keyPattern = { activeRequestKey: 1 }
				throw error
			}
			const task = {
				...payload,
				_id: `task-${tasks.length + 1}`,
				responders: [],
				createdAt: now,
				updatedAt: now,
				save: async () => {},
			}
			tasks.push(task)
			return task
		},
	}
	const service = createTaskService({
		io: { emit: () => {}, to: () => ({ emit: () => {} }) },
		models: {
			Deployment: {
				findOne: () => ({ select: () => ({ lean: async () => ({ patrolArea: 'Catabayungan' }) }) }),
				distinct: async () => [],
			},
			Task,
		},
		loadPersonnelMap: async () => new Map(),
		personnelService: {
			getPersonnelMember: async (personnelId) => ({
				id: personnelId,
				name: `Officer ${personnelId}`,
				latitude: 17.4305,
				longitude: 121.765,
				isLocationStale: false,
				locationName: 'Catabayungan',
			}),
		},
		notificationService: {
			createNotification: async () => {},
			deliverNotification: async () => {},
		},
		clock: () => now,
		idGenerator: () => `${(++sequence).toString(16).padStart(8, '0')}-fixed-id`,
	})
	return { service, tasks }
}

describe('task authorization', () => {
	it('rejects task acceptance when the officer is off duty', async () => {
		const result = await createService().acceptTask('TSK-1', 'PNP-OFF-DUTY')
		assert.equal(result.status, 403)
		assert.match(result.body.message, /active deployment/)
	})

	it('allows only the requesting officer to cancel backup', async () => {
		const result = await createService({
			task: { taskId: 'TSK-1', requestedBy: 'PNP-REQUESTER', type: 'backup' },
		}).cancelTask('TSK-1', 'PNP-DIFFERENT')
		assert.equal(result.status, 403)
		assert.match(result.body.message, /requested backup/)
	})
})

describe('backup request concurrency', () => {
	it('creates independent requests when different on-duty officers request backup together', async () => {
		const fixture = createBackupFixture()
		const requests = ['PNP-001', 'PNP-002', 'PNP-003', 'PNP-004'].map((personnelId) => (
			fixture.service.createTask({ type: 'backup', requested_by: personnelId })
		))
		const tasks = await Promise.all(requests)

		assert.equal(tasks.length, 4)
		assert.equal(fixture.tasks.length, 4)
		assert.equal(new Set(tasks.map((task) => task.id)).size, 4)
	})

	it('allows only one active request when the same account submits from two devices', async () => {
		const fixture = createBackupFixture()
		const payload = { type: 'backup', requested_by: 'PNP-SAME-ACCOUNT' }
		const results = await Promise.allSettled([
			fixture.service.createTask(payload),
			fixture.service.createTask(payload),
		])

		assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
		const rejected = results.find((result) => result.status === 'rejected')
		assert.equal(rejected.reason.status, 409)
		assert.equal(rejected.reason.code, 'ACTIVE_BACKUP_REQUEST_EXISTS')
		assert.match(rejected.reason.message, /already have an active backup request/i)
		assert.equal(fixture.tasks.length, 1)
	})

	it('rejects a new request while an existing request is open', async () => {
		const fixture = createBackupFixture({ existingRequest: true })
		await assert.rejects(
			fixture.service.createTask({ type: 'backup', requested_by: 'PNP-001' }),
			{ status: 409, code: 'ACTIVE_BACKUP_REQUEST_EXISTS' },
		)
		assert.equal(fixture.tasks.length, 0)
	})

	it('releases the active-request key when backup is cancelled or completed', async () => {
		for (const action of ['cancelTask', 'completeTask']) {
			const task = {
				taskId: `TSK-${action}`,
				type: 'backup',
				requestedBy: 'PNP-REQUESTER',
				requesterName: 'Requester',
				title: 'Backup request',
				description: '',
				locationName: 'Catabayungan',
				location: { type: 'Point', coordinates: [121.765, 17.4305] },
				requiredResponders: 3,
				responders: [],
				status: 'open',
				activeRequestKey: 'backup:PNP-REQUESTER',
				createdAt: new Date(),
				updatedAt: new Date(),
				save: async () => {},
			}
			const service = createService({ task })
			await service[action](task.taskId, 'PNP-REQUESTER')
			assert.equal(task.activeRequestKey, undefined)
		}
	})
})
