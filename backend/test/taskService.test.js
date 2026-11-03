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

const createBackupFixture = ({
	existingRequest = false,
	latitude = 17.4305,
	longitude = 121.765,
	locationName = 'Catabayungan',
	resolveBackupLocation,
	backupLocationBudgetMs,
	onDutyPersonnelIds = [],
	currentLocations = [],
} = {}) => {
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
			CurrentLocation: {
				find: () => ({ lean: async () => currentLocations }),
			},
			Deployment: {
				findOne: () => ({ select: () => ({ lean: async () => ({ patrolArea: 'Catabayungan' }) }) }),
				distinct: async () => onDutyPersonnelIds,
			},
			Task,
		},
		loadPersonnelMap: async () => new Map(),
		personnelService: {
			getPersonnelMember: async (personnelId) => ({
				id: personnelId,
				name: `Officer ${personnelId}`,
				latitude,
				longitude,
				isLocationStale: false,
				locationName,
			}),
		},
		notificationService: {
			createNotification: async () => {},
			deliverNotification: async (notification) => deliveries.push(notification),
		},
		auditService: { recordAudit: async (entry) => audits.push(entry) },
		clock: () => now,
		idGenerator: () => `${(++sequence).toString(16).padStart(8, '0')}-fixed-id`,
		...(resolveBackupLocation && { resolveBackupLocation }),
		...(backupLocationBudgetMs !== undefined && { backupLocationBudgetMs }),
	})
	return { audits, deliveries, service, tasks }
}

const createArrivalFixture = ({ task, location, requesterLocation }) => {
	const now = new Date('2026-09-14T08:00:00Z')
	const deliveries = []
	const audits = []
	let updates = 0
	const service = createTaskService({
		io: { emit: () => {}, to: () => ({ emit: () => {} }) },
		models: {
			CurrentLocation: {
				find: () => ({ lean: async () => [
					...(location ? [location] : []),
					...(requesterLocation ? [requesterLocation] : [{
						personnelId: task.requestedBy,
						source: 'gps',
						isSimulated: false,
						recordedAt: new Date('2026-09-14T07:59:55Z'),
						location: task.location,
					}]),
				] }),
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

it('cleans only active task participation when an officer account is deactivated', async () => {
	const now = new Date('2026-11-03T10:00:00Z')
	const audits = []
	const requestedTask = {
		taskId: 'TASK-REQUESTED', type: 'backup', title: 'Backup request', description: '',
		requestedBy: 'PNP-001', requesterName: 'Officer One', requiredResponders: 2,
		responders: [{ personnelId: 'PNP-002', acceptedAt: now }],
		locationName: 'Cabagan', location: { coordinates: [121.76, 17.42] },
		status: 'open', activeRequestKey: 'backup:PNP-001', createdAt: now, updatedAt: now,
		save: async () => {},
	}
	const responseTask = {
		taskId: 'TASK-RESPONSE', type: 'urgent', title: 'Urgent task', description: '',
		requestedBy: 'supervisor', requesterName: 'Supervisor', requiredResponders: 2,
		responders: [
			{ personnelId: 'PNP-001', acceptedAt: now },
			{ personnelId: 'PNP-002', acceptedAt: now },
		],
		locationName: 'Cabagan', location: { coordinates: [121.76, 17.42] },
		status: 'full', createdAt: now, updatedAt: now,
		save: async () => {},
	}
	let taskFilter
	const service = createTaskService({
		io: { emit: () => {}, to: () => ({ emit: () => {} }) },
		models: {
			Deployment: { distinct: async () => ['PNP-001', 'PNP-002'] },
			Task: {
				find: async (filter) => {
					taskFilter = filter
					return [requestedTask, responseTask]
				},
			},
		},
		loadPersonnelMap: async () => new Map(),
		personnelService: { getPersonnelMember: async () => null },
		notificationService: { deliverNotification: async () => {} },
		auditService: { recordAudit: async (entry) => audits.push(entry) },
		clock: () => now,
	})

	const result = await service.deactivatePersonnelTasks('PNP-001', {
		role: 'supervisor', username: '00-0001',
	})
	assert.deepEqual(taskFilter.status, { $in: ['open', 'full'] })
	assert.equal(requestedTask.status, 'cancelled')
	assert.equal(requestedTask.cancelledAt, now)
	assert.equal(requestedTask.activeRequestKey, undefined)
	assert.equal(responseTask.status, 'open')
	assert.deepEqual(responseTask.responders.map(({ personnelId }) => personnelId), ['PNP-002'])
	assert.deepEqual(result, { cancelled: 1, withdrawn: 1 })
	assert.deepEqual(audits.map(({ action }) => action), [
		'task.cancelled_on_account_deactivation',
		'task.responder_withdrawn_on_account_deactivation',
	])
})

describe('task authorization', () => {
	it('rejects task acceptance when the officer is off duty', async () => {
		const result = await createService().acceptTask('TSK-1', 'PNP-OFF-DUTY')
		assert.equal(result.status, 403)
		assert.match(result.body.message, /active deployment/)
	})

	it('rejects an on-duty officer outside the saved backup audience', async () => {
		const result = await createService({
			deploymentExists: true,
			task: {
				taskId: 'TSK-1', type: 'backup', requestedBy: 'PNP-REQUESTER',
				eligiblePersonnelIds: ['PNP-NEAR'], responders: [], status: 'open',
			},
		}).acceptTask('TSK-1', 'PNP-OUTSIDE')
		assert.equal(result.status, 403)
		assert.match(result.body.message, /response group/)
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

	it('measures arrival from the requester live position instead of the original request point', async () => {
		const task = {
			taskId: 'TSK-MOVING', requestedBy: 'PNP-REQUESTER', requesterName: 'Requester',
			type: 'backup', title: 'Backup request', description: '', locationName: 'Original point',
			location: { type: 'Point', coordinates: [121.765, 17.4305] },
			responders: [{ personnelId: 'PNP-RESPONDER', acceptedAt: new Date() }],
			status: 'open', createdAt: new Date(), updatedAt: new Date(),
		}
		const fixture = createArrivalFixture({
			task,
			requesterLocation: {
				personnelId: 'PNP-REQUESTER', source: 'gps', isSimulated: false,
				recordedAt: new Date('2026-09-14T07:59:55Z'),
				location: { type: 'Point', coordinates: [121.775, 17.4405] },
			},
			location: {
				personnelId: 'PNP-RESPONDER', source: 'gps', isSimulated: false,
				recordedAt: new Date('2026-09-14T07:59:55Z'),
				location: { type: 'Point', coordinates: [121.77505, 17.44055] },
			},
		})
		const result = await fixture.service.reconcileTaskArrivals({ personnelIds: ['PNP-REQUESTER'] })
		assert.equal(result.arrived, 1)
		assert.ok(task.responders[0].arrivalDistanceMeters < 20)
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

	it('lets the requester notify the remaining on-duty officers', async () => {
		const deliveries = []
		const task = {
			taskId: 'TSK-EXPAND', type: 'backup', title: 'Backup request', locationName: 'Cabagan',
			requestedBy: 'PNP-REQUESTER', requesterName: 'Requester', requiredResponders: 10,
			eligiblePersonnelIds: ['PNP-NEAR'], audienceMode: 'nearby', responders: [],
			status: 'open', createdAt: new Date(), updatedAt: new Date(), save: async () => {},
		}
		const service = createTaskService({
			io: { emit: () => {}, to: () => ({ emit: () => {} }) },
			models: {
				Deployment: { distinct: async () => ['PNP-REQUESTER', 'PNP-NEAR', 'PNP-FAR'] },
				Task: { findOne: async () => task },
			},
			loadPersonnelMap: async () => new Map(),
			personnelService: { getPersonnelMember: async () => null },
			notificationService: { deliverNotification: async (entry) => deliveries.push(entry) },
		})
		const result = await service.expandTaskAudience('TSK-EXPAND', {
			role: 'officer', personnelId: 'PNP-REQUESTER',
		})
		assert.equal(result.status, 200)
		assert.equal(result.body.added_count, 1)
		assert.deepEqual(task.eligiblePersonnelIds, ['PNP-NEAR', 'PNP-FAR'])
		assert.equal(task.audienceMode, 'expanded_all')
		assert.deepEqual(deliveries.map(({ recipientId }) => recipientId), ['PNP-FAR'])
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

	it('uses the requested responder count without the former limit of five', async () => {
		const fixture = createBackupFixture()
		const task = await fixture.service.createTask({
			type: 'backup', requested_by: 'PNP-001', required_responders: 12,
		})
		assert.equal(task.required_responders, 12)
		assert.equal(fixture.tasks[0].requiredResponders, 12)
	})

	it('notifies only fresh on-duty officers within one kilometer', async () => {
		const fixture = createBackupFixture({
			onDutyPersonnelIds: ['PNP-001', 'PNP-NEAR', 'PNP-FAR'],
			currentLocations: [
				{
					personnelId: 'PNP-NEAR', source: 'gps', isSimulated: false,
					recordedAt: new Date('2026-09-11T07:59:55Z'),
					location: { type: 'Point', coordinates: [121.7652, 17.4307] },
				},
				{
					personnelId: 'PNP-FAR', source: 'gps', isSimulated: false,
					recordedAt: new Date('2026-09-11T07:59:55Z'),
					location: { type: 'Point', coordinates: [121.79, 17.46] },
				},
			],
		})
		const task = await fixture.service.createTask({ type: 'backup', requested_by: 'PNP-001' })
		assert.equal(task.audience_mode, 'nearby')
		assert.deepEqual(task.eligible_responder_ids, ['PNP-NEAR'])
		assert.deepEqual(fixture.deliveries.map(({ recipientId }) => recipientId), ['supervisor', 'PNP-NEAR'])
	})

	it('falls back to every on-duty officer when nobody has a fresh location within one kilometer', async () => {
		const fixture = createBackupFixture({
			onDutyPersonnelIds: ['PNP-001', 'PNP-002', 'PNP-003'],
			currentLocations: [],
		})
		const task = await fixture.service.createTask({ type: 'backup', requested_by: 'PNP-001' })
		assert.equal(task.audience_mode, 'fallback_all')
		assert.deepEqual(task.eligible_responder_ids, ['PNP-002', 'PNP-003'])
	})

	it('uses a resolved place name while keeping the exact GPS request point', async () => {
		const fixture = createBackupFixture({
			latitude: 17.42831,
			longitude: 121.77042,
			locationName: 'GPS 17.42831, 121.77042',
			resolveBackupLocation: async () => 'Eastern, Catabayungan, Cabagan',
		})
		const task = await fixture.service.createTask({ type: 'backup', requested_by: 'PNP-001' })
		assert.equal(task.location, 'Eastern, Catabayungan, Cabagan')
		assert.equal(task.latitude, 17.42831)
		assert.equal(task.longitude, 121.77042)
		assert.match(fixture.deliveries[0].message, /at Eastern, Catabayungan, Cabagan\./)
	})

	it('keeps backup alerts readable when place-name lookup is slow', async () => {
		const fixture = createBackupFixture({
			latitude: 17.42831,
			longitude: 121.77042,
			locationName: 'GPS 17.42831, 121.77042',
			resolveBackupLocation: () => new Promise(() => {}),
			backupLocationBudgetMs: 5,
		})
		const task = await fixture.service.createTask({ type: 'backup', requested_by: 'PNP-001' })
		assert.equal(task.location, 'the current GPS position')
		assert.match(fixture.deliveries[0].message, /at the current GPS position\./)
		assert.equal(fixture.deliveries[0].data.latitude, 17.42831)
		assert.equal(fixture.deliveries[0].data.longitude, 121.77042)
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
