const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createTaskService = require('../src/services/operations/taskService')

const createService = ({
	deploymentExists = false,
	task = null,
	member = null,
	findOneAndUpdate = async () => null,
} = {}) => createTaskService({
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
			findOneAndUpdate,
		},
	},
	loadPersonnelMap: async () => new Map(),
	personnelService: { getPersonnelMember: async () => member },
	notificationService: {
		createNotification: async () => {},
		deliverNotification: async () => {},
	},
})

const createBackupFixture = ({ existingRequest = false } = {}) => {
	const now = new Date('2026-09-11T08:00:00Z')
	const tasks = []
	const deliveries = []
	const audits = []
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
			deliverNotification: async (notification) => deliveries.push(notification),
		},
		auditService: { recordAudit: async (entry) => audits.push(entry) },
		clock: () => now,
		idGenerator: () => `${(++sequence).toString(16).padStart(8, '0')}-fixed-id`,
	})
	return { audits, deliveries, service, tasks }
}

const createArrivalFixture = ({ task, location }) => {
	const now = new Date('2026-09-14T08:00:00Z')
	const deliveries = []
	const audits = []
	let updates = 0
	const service = createTaskService({
		io: { emit: () => {}, to: () => ({ emit: () => {} }) },
		models: {
			CurrentLocation: {
				find: () => ({ lean: async () => location ? [location] : [] }),
			},
			Deployment: { distinct: async () => [] },
			Task: {
				find: () => ({ lean: async () => [task] }),
				findOneAndUpdate: async (_filter, update) => {
					const responder = task.responders[0]
					if (responder.arrivedAt) return null
					responder.arrivedAt = update.$set['responders.$.arrivedAt']
					responder.arrivalDistanceMeters = update.$set['responders.$.arrivalDistanceMeters']
					responder.arrivalLocation = update.$set['responders.$.arrivalLocation']
					updates += 1
					return task
				},
			},
		},
		loadPersonnelMap: async () => new Map([[
			'PNP-RESPONDER',
			{ fullName: 'Responder One', rank: 'PO1', badgeNumber: '1001' },
		]]),
		personnelService: { getPersonnelMember: async () => null },
		notificationService: {
			createNotification: async () => {},
			deliverNotification: async (notification) => deliveries.push(notification),
		},
		auditService: { recordAudit: async (entry) => audits.push(entry) },
		clock: () => now,
	})
	return { audits, deliveries, getUpdates: () => updates, service }
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

	it('allows the requesting officer to complete their backup response', async () => {
		const task = {
			taskId: 'TSK-1',
			requestedBy: 'PNP-REQUESTER',
			requesterName: 'Requester',
			type: 'backup',
			title: 'Backup request',
			locationName: 'Catabayungan',
			location: { type: 'Point', coordinates: [121.765, 17.4305] },
			requiredResponders: 3,
			responders: [{
				personnelId: 'PNP-RESPONDER',
				acceptedAt: new Date(),
				arrivedAt: new Date(),
			}],
			status: 'open',
			activeRequestKey: 'backup:PNP-REQUESTER',
			createdAt: new Date(),
			updatedAt: new Date(),
			save: async () => {},
		}
		const result = await createService({ task }).completeTask('TSK-1', {
			role: 'officer',
			personnelId: 'PNP-REQUESTER',
		})
		assert.equal(result.status, 200)
		assert.equal(task.status, 'completed')
		assert.equal(task.completedBy, 'PNP-REQUESTER')
		assert.equal(task.activeRequestKey, undefined)
	})

	it('rejects completion until a responder has a verified arrival', async () => {
		const task = {
			taskId: 'TSK-1',
			requestedBy: 'PNP-REQUESTER',
			type: 'backup',
			responders: [{ personnelId: 'PNP-RESPONDER', acceptedAt: new Date() }],
			status: 'open',
		}
		const result = await createService({ task }).completeTask('TSK-1', {
			role: 'officer',
			personnelId: 'PNP-REQUESTER',
		})

		assert.equal(result.status, 409)
		assert.equal(result.body.code, 'BACKUP_ARRIVAL_REQUIRED')
		assert.match(result.body.message, /GeoSentri to detect/)
	})

	it('automatically records arrival from a fresh tracker reading near the request point', async () => {
		const task = {
			taskId: 'TSK-1',
			requestedBy: 'PNP-REQUESTER',
			requesterName: 'Requester',
			type: 'backup',
			title: 'Backup request',
			description: '',
			locationName: 'Catabayungan',
			location: { type: 'Point', coordinates: [121.765, 17.4305] },
			requiredResponders: 3,
			responders: [{ personnelId: 'PNP-RESPONDER', acceptedAt: new Date() }],
			status: 'open',
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		const location = {
			personnelId: 'PNP-RESPONDER',
			source: 'gps',
			isSimulated: false,
			recordedAt: new Date('2026-09-14T07:59:55Z'),
			location: { type: 'Point', coordinates: [121.76505, 17.43055] },
		}
		const fixture = createArrivalFixture({ task, location })

		const result = await fixture.service.reconcileTaskArrivals({ personnelIds: ['PNP-RESPONDER'] })

		assert.equal(result.arrived, 1)
		assert.equal(fixture.getUpdates(), 1)
		assert.ok(task.responders[0].arrivalDistanceMeters < 150)
		assert.equal(fixture.deliveries.length, 2)
		assert.deepEqual(new Set(fixture.deliveries.map((item) => item.recipientId)), new Set(['PNP-REQUESTER', 'supervisor']))
		assert.equal(fixture.deliveries.find((item) => item.recipientId === 'supervisor').data.destination, 'Map')
		assert.equal(fixture.deliveries.find((item) => item.recipientId === 'PNP-REQUESTER').data.destination, 'Tasks')
		assert.equal(fixture.audits[0].action, 'task.responder_arrived')
	})

	it('does not record automatic arrival from a stale or distant tracker reading', async () => {
		const baseTask = () => ({
			taskId: 'TSK-1', requestedBy: 'PNP-REQUESTER', type: 'backup', status: 'open',
			location: { type: 'Point', coordinates: [121.765, 17.4305] },
			responders: [{ personnelId: 'PNP-RESPONDER', acceptedAt: new Date() }],
		})
		const staleFixture = createArrivalFixture({
			task: baseTask(),
			location: {
				personnelId: 'PNP-RESPONDER', source: 'gps', isSimulated: false,
				recordedAt: new Date('2026-09-14T07:50:00Z'),
				location: { type: 'Point', coordinates: [121.765, 17.4305] },
			},
		})
		const staleResult = await staleFixture.service.reconcileTaskArrivals()
		assert.equal(staleResult.arrived, 0)
		assert.equal(staleFixture.getUpdates(), 0)

		const farFixture = createArrivalFixture({
			task: baseTask(),
			location: {
				personnelId: 'PNP-RESPONDER', source: 'gps', isSimulated: false,
				recordedAt: new Date('2026-09-14T07:59:55Z'),
				location: { type: 'Point', coordinates: [121.78, 17.45] },
			},
		})
		const farResult = await farFixture.service.reconcileTaskArrivals()
		assert.equal(farResult.arrived, 0)
		assert.equal(farResult.checked, 1)
		assert.equal(farFixture.getUpdates(), 0)
	})

	it('rejects completion by a different officer', async () => {
		const task = {
			taskId: 'TSK-1', requestedBy: 'PNP-REQUESTER', type: 'backup', status: 'open', responders: [],
		}
		const result = await createService({ task }).completeTask('TSK-1', {
			role: 'officer',
			personnelId: 'PNP-DIFFERENT',
		})
		assert.equal(result.status, 403)
		assert.match(result.body.message, /requesting officer or the COP/)
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

	it('notifies the supervisor with the requester and exact backup request', async () => {
		const fixture = createBackupFixture()
		const task = await fixture.service.createTask({ type: 'backup', requested_by: 'PNP-001' })
		assert.equal(fixture.deliveries.length, 1)
		assert.equal(fixture.deliveries[0].recipientId, 'supervisor')
		assert.equal(fixture.deliveries[0].referenceId, task.id)
		assert.equal(fixture.deliveries[0].data.taskId, task.id)
		assert.equal(fixture.deliveries[0].data.personnelId, 'PNP-001')
		assert.equal(fixture.audits[0].action, 'task.backup_requested')
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
				responders: action === 'completeTask'
					? [{ personnelId: 'PNP-RESPONDER', acceptedAt: new Date(), arrivedAt: new Date() }]
					: [],
				status: 'open',
				activeRequestKey: 'backup:PNP-REQUESTER',
				createdAt: new Date(),
				updatedAt: new Date(),
				save: async () => {},
			}
			const service = createService({ task })
			if (action === 'completeTask') {
				await service[action](task.taskId, { role: 'officer', personnelId: 'PNP-REQUESTER' })
			} else {
				await service[action](task.taskId, 'PNP-REQUESTER')
			}
			assert.equal(task.activeRequestKey, undefined)
		}
	})
})
