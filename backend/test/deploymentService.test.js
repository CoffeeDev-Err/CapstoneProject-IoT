const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createDeploymentService = require('../src/services/operations/deploymentService')
const { deploymentNoticeSignature } = require('../src/services/operations/domain')
const { formatDeploymentNotificationMessage, normalizeDeploymentConfiguration } = createDeploymentService

describe('deployment configuration', () => {
	it('validates route modes, clears non-route modes and changes notice/acknowledgement signatures', () => {
		const route = { patrolAreaId: 'cabagan-santa-maria-road', deploymentType: 'route' }
		for (const patrolMode of ['walk', 'car', 'motorcycle']) {
			assert.equal(normalizeDeploymentConfiguration({ ...route, patrolMode }).patrolMode, patrolMode)
		}
		assert.throws(() => normalizeDeploymentConfiguration({ ...route, patrolMode: 'aircraft' }), /Walk, Car, or Motorcycle/)
		assert.equal(normalizeDeploymentConfiguration({ patrolAreaId: 'barangay-magassi', deploymentType: 'area', patrolMode: 'car' }).patrolMode, '')
		assert.notEqual(deploymentNoticeSignature({ ...route, patrolMode: 'car' }), deploymentNoticeSignature({ ...route, patrolMode: 'walk' }))
		const { deploymentSignature } = require('../src/services/operations/domain')
		assert.notEqual(deploymentSignature({ ...route, patrolMode: 'car' }), deploymentSignature({ ...route, patrolMode: 'walk' }))
		assert.equal(deploymentSignature(route), deploymentSignature({ ...route, patrolMode: '' }))
	})
	it('allows a barangay-wide patrol without an exact point', () => {
		assert.deepEqual(
			normalizeDeploymentConfiguration({
				patrolAreaId: 'barangay-magassi',
				deploymentType: 'area',
			}),
			{
				patrolAreaId: 'barangay-magassi',
				patrolArea: 'Barangay Magassi',
				deploymentType: 'area',
				coverageBarangayCodes: ['MAGASSI'],
				patrolMode: '',
				deploymentPointLabel: '',
				latitude: null,
				longitude: null,
			},
		)
		assert.throws(() => normalizeDeploymentConfiguration({
			patrolAreaId: 'barangay-magassi',
			deploymentType: 'area',
			latitude: 17.4239,
			longitude: 121.7681,
		}), /does not use an exact deployment point/i)
	})

	it('requires a named Cabagan point for a fixed post', () => {
		assert.throws(() => normalizeDeploymentConfiguration({
			patrolAreaId: 'cabagan-public-market-zone',
			deploymentType: 'point',
		}), /fixed deployment point/i)
		assert.throws(() => normalizeDeploymentConfiguration({
			patrolAreaId: 'cabagan-public-market-zone',
			deploymentType: 'point',
			latitude: 0,
			longitude: 0,
			deploymentPointLabel: 'Outside point',
		}), /inside Cabagan/i)

		const configuration = normalizeDeploymentConfiguration({
			patrolAreaId: 'cabagan-public-market-zone',
			deploymentType: 'point',
			latitude: 17.4239,
			longitude: 121.7681,
			deploymentPointLabel: 'Main entrance',
		})
		assert.equal(configuration.deploymentPointLabel, 'Main entrance')
		assert.equal(configuration.latitude, 17.4239)
	})

	it('accepts route patrol only for catalogued road or route areas', () => {
		assert.throws(() => normalizeDeploymentConfiguration({
			patrolAreaId: 'barangay-magassi',
			deploymentType: 'route',
		}), /requires a road or route/i)
		assert.equal(normalizeDeploymentConfiguration({
			patrolAreaId: 'cabagan-santa-maria-road',
			deploymentType: 'route',
		}).deploymentType, 'route')
		assert.throws(() => normalizeDeploymentConfiguration({
			patrolAreaId: 'cabagan-santa-maria-road',
			deploymentType: 'route',
			latitude: 17.4239,
			longitude: 121.7681,
		}), /deployment point label/i)
	})
})

const createService = ({ Deployment, Personnel, published = [], audits = [] }) => createDeploymentService({
	io: { emit: () => {}, to: () => ({ emit: () => {} }) },
	models: { Deployment, Personnel },
	loadPersonnelMap: async () => new Map([
		['PNP-001', { fullName: 'Officer One', rank: 'Patrolman' }],
	]),
	personnelService: {
		emitPersonnelCollection: () => {},
		getPersonnelWithLocations: async () => [],
	},
	notificationService: {
		createNotification: async () => {},
		deliverNotification: async () => {},
	},
	auditService: { recordAudit: async (entry) => audits.push(entry) },
	publish: {
		emitToSupervisorAndPersonnel: (...args) => published.push(args),
	},
	clock: () => new Date(),
})

it('paginates completed and cancelled history together with stable ordering and officer-scoped search totals', async () => {
	const filters = [], counts = [], calls = {}
	const Deployment = {
		find: filter => {
			filters.push(filter)
			const query = { sort: value => { calls.sort = value; return query }, skip: value => { calls.skip = value; return query }, limit: value => { calls.limit = value; return query }, lean: async () => [] }
			return query
		},
		countDocuments: async filter => { counts.push(filter); return filter.$and ? 23 : 106 },
	}
	const service = createService({ Deployment })
	const result = await service.listDeployments({ view: 'history', page: 2, limit: 10, search: 'Market', group_id: 'GROUP-001' }, { role: 'officer', personnelId: 'PNP-001' })
	assert.deepEqual(filters[0].status, { $in: ['completed', 'cancelled', 'ended_early'] })
	assert.equal(filters[0].personnelId, 'PNP-001')
	assert.equal(filters[0].groupId, 'GROUP-001')
	assert.deepEqual(calls.sort, { assignedAt: -1, _id: -1 })
	assert.equal(calls.skip, 10); assert.equal(calls.limit, 10)
	assert.equal(result.pagination.total, 23); assert.equal(result.pagination.totalPages, 3)
	assert.equal(result.historyTotal, 106)
	assert.equal(counts[1].personnelId, 'PNP-001')
	assert.equal(counts[1].$and, undefined)
})

it('identifies a conflicting scheduled shift without cancelling or saving either deployment', async () => {
	let writes = 0
	const service = createService({
		Deployment: { updateMany: async () => { writes += 1 } },
		Personnel: { find: () => ({ select: () => ({ lean: async () => [
			{ personnelId: 'PNP-001', fullName: 'Officer One', rank: 'Patrolman' },
		] }) }) },
	})
	const now = Date.now()
	const base = { personnelId: 'PNP-001', patrolAreaId: 'barangay-anao', deploymentType: 'area' }
	await assert.rejects(service.replaceDeployments([
		{ ...base, id: 'DEP-001', status: 'active', shiftStart: new Date(now - 60_000), shiftEnd: new Date(now + 7_200_000) },
		{ ...base, id: 'DEP-002', status: 'scheduled', shiftStart: new Date(now + 3_600_000), shiftEnd: new Date(now + 10_800_000) },
	]), (error) => {
		assert.equal(error.code, 'DEPLOYMENT_SHIFT_CONFLICT')
		assert.match(error.message, /Active at Barangay Anao/)
		assert.match(error.message, /Scheduled at Barangay Anao/)
		assert.match(error.message, /PHT/)
		assert.match(error.message, /Assigned Deployments/)
		return true
	})
	assert.equal(writes, 0)
})

it('rejects a stale planner save that would reopen an ended duty without writing any deployment', async () => {
	let writes = 0
	const service = createService({
		Deployment: {
			find: () => ({ lean: async () => [{ assignmentId: 'DEP-ENDED', status: 'ended_early' }] }),
			bulkWrite: async () => { writes++ }, updateMany: async () => { writes++ },
		},
		Personnel: { find: () => ({ select: () => ({ lean: async () => [{ personnelId: 'PNP-001', fullName: 'Officer One' }] }) }) },
	})
	await assert.rejects(service.replaceDeployments([{
		id: 'DEP-ENDED', personnelId: 'PNP-001', patrolAreaId: 'barangay-anao', deploymentType: 'area',
		status: 'active', shiftStart: new Date(Date.now() - 60_000), shiftEnd: new Date(Date.now() + 3_600_000),
	}]), error => error.status === 409 && /already ended/.test(error.message))
	assert.equal(writes, 0)
})

it('cancels active and scheduled deployments when an officer account is deactivated', async () => {
	const audits = []
	const active = {
		assignmentId: 'DEP-ACTIVE', personnelId: 'PNP-001', status: 'active',
		save: async () => {},
	}
	const scheduled = {
		assignmentId: 'DEP-SCHEDULED', personnelId: 'PNP-001', status: 'scheduled',
		save: async () => {},
	}
	let lifecycleFilter
	const Deployment = {
		find: (filter) => {
			if (filter.status?.$in) {
				lifecycleFilter = filter
				return Promise.resolve([active, scheduled])
			}
			return {
				sort: () => ({ lean: async () => [] }),
			}
		},
	}
	const service = createService({
		Deployment,
		Personnel: {},
		audits,
	})

	const result = await service.deactivatePersonnelDeployments('PNP-001', {
		role: 'supervisor', username: '00-0001',
	})
	assert.deepEqual(lifecycleFilter.status, { $in: ['scheduled', 'active'] })
	assert.equal(active.status, 'cancelled')
	assert.equal(scheduled.status, 'cancelled')
	assert.deepEqual(result, { cancelled: 2 })
	assert.deepEqual(audits.map(({ action }) => action), [
		'deployment.cancelled_on_account_deactivation',
		'deployment.cancelled_on_account_deactivation',
	])
})

describe('deployment acknowledgement', () => {
	it('stores a content signature and publishes a scoped acknowledgement', async () => {
		const now = Date.now()
		let saved = false
		const deployment = {
			assignmentId: 'DEP-001',
			groupId: 'GROUP-001',
			personnelId: 'PNP-001',
			personnelName: 'Officer One',
			rank: 'Patrolman',
			patrolArea: 'Centro',
			shiftStart: new Date(now - 60_000),
			shiftEnd: new Date(now + 60_000),
			assignedAt: new Date(now - 120_000),
			instructions: 'Patrol the assigned area.',
			location: { type: 'Point', coordinates: [121.77, 17.42] },
			status: 'active',
			save: async () => { saved = true },
		}
		const published = []
		const audits = []
		const service = createService({
			Deployment: { findOne: async () => deployment },
			Personnel: {},
			published,
			audits,
		})

		const result = await service.acknowledgeDeployment('DEP-001', 'PNP-001')

		assert.equal(result.status, 200)
		assert.equal(saved, true)
		assert.match(deployment.acknowledgedSignature, /^[a-f0-9]{64}$/)
		assert.equal(result.body.deployment.acknowledged, true)
		assert.equal(published.length, 1)
		assert.deepEqual(published[0].slice(0, 1), ['deployment:acknowledged'])
		assert.equal(published[0][2], 'PNP-001')
		assert.equal(audits[0].action, 'deployment.acknowledged')
	})

	it('prevents an officer from acknowledging another officer assignment', async () => {
		const service = createService({
			Deployment: {
				findOne: async () => ({
					assignmentId: 'DEP-001', personnelId: 'PNP-001', status: 'active',
				}),
			},
			Personnel: {},
		})

		const result = await service.acknowledgeDeployment('DEP-001', 'PNP-OTHER')
		assert.equal(result.status, 403)
		assert.match(result.body.message, /own assignment/)
	})
})

describe('deployment reconciliation', () => {
	it('activates started shifts, completes ended shifts, and synchronizes duty status', async () => {
		const now = new Date()
		const deploymentFindResults = [
			[{ assignmentId: 'DEP-A', personnelId: 'PNP-001' }],
			[{ assignmentId: 'DEP-B', personnelId: 'PNP-002' }],
			[{ assignmentId: 'DEP-B', personnelId: 'PNP-002', status: 'completed', endReason: 'scheduled_end' }],
		]
		const deploymentUpdates = []
		const personnelUpdates = []
		const service = createService({
			Deployment: {
				find: () => ({ lean: async () => deploymentFindResults.shift() }),
				updateMany: async (filter, update) => {
					deploymentUpdates.push({ filter, update })
					return { modifiedCount: 1 }
				},
				distinct: async () => ['PNP-001'],
			},
			Personnel: {
				updateMany: async (filter, update) => {
					personnelUpdates.push({ filter, update })
					return { modifiedCount: 1 }
				},
			},
		})

		const result = await service.reconcileDeploymentShifts({ broadcast: false, now })

		assert.equal(result.changed, true)
		assert.deepEqual(result.affectedPersonnelIds, ['PNP-001', 'PNP-002'])
		assert.deepEqual(result.onDutyPersonnelIds, ['PNP-001'])
		assert.equal(deploymentUpdates[0].update.$set.status, 'completed')
		assert.equal(deploymentUpdates[1].update.$set.status, 'active')
		assert.equal(personnelUpdates[0].update.$set.dutyStatus, 'On Duty')
		assert.equal(personnelUpdates[1].update.$set.dutyStatus, 'Off Duty')
	})
})

describe('deployment notifications', () => {
	it('treats a changed deployment type or point as a notification-worthy update', () => {
		const base = {
			personnelId: 'PNP-001',
			patrolAreaId: 'cabagan-public-market-zone',
			patrolArea: 'Cabagan Public Market Zone',
			deploymentType: 'point',
			coverageBarangayCodes: ['CENTRO'],
			deploymentPointLabel: 'Main entrance',
			latitude: 17.4239,
			longitude: 121.7681,
			status: 'active',
		}
		assert.notEqual(
			deploymentNoticeSignature(base),
			deploymentNoticeSignature({ ...base, deploymentPointLabel: 'North entrance' }),
		)
		assert.notEqual(
			deploymentNoticeSignature(base),
			deploymentNoticeSignature({ ...base, longitude: 121.769 }),
		)
	})

	it('includes provided instructions in active and scheduled assignment messages', () => {
		const assignment = { patrolArea: 'Barangay Centro', notes: 'Use the eastern checkpoint' }

		assert.equal(
			formatDeploymentNotificationMessage({ assignment, scheduled: true, scheduleText: 'Sep 16, 2026, 8:00 AM' }),
			'You are scheduled at Barangay Centro on Sep 16, 2026, 8:00 AM. Instructions: Use the eastern checkpoint.',
		)
		assert.equal(
			formatDeploymentNotificationMessage({ assignment, scheduled: false, scheduleText: '' }),
			'You are assigned to Barangay Centro. Instructions: Use the eastern checkpoint. Open Map to confirm your deployment.',
		)
	})

	it('keeps the assignment message concise when no instructions were provided', () => {
		assert.equal(
			formatDeploymentNotificationMessage({
				assignment: { patrolArea: 'Barangay Centro', notes: '   ' },
				scheduled: false,
				scheduleText: '',
			}),
			'You are assigned to Barangay Centro. Open Map to confirm your deployment.',
		)
	})

	it('includes the exact post label for a fixed-post deployment', () => {
		assert.equal(
			formatDeploymentNotificationMessage({
				assignment: {
					patrolArea: 'Cabagan Public Market Zone',
					deploymentType: 'point',
					deploymentPointLabel: 'Main entrance',
				},
				scheduled: false,
				scheduleText: '',
			}),
			'You are assigned to Cabagan Public Market Zone (Main entrance). Open Map to confirm your deployment.',
		)
	})
})
