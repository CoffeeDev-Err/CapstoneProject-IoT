const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createDeploymentService = require('../src/services/operations/deploymentService')
const { formatDeploymentNotificationMessage } = createDeploymentService

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
})
