const assert = require('node:assert/strict')
const { it } = require('node:test')
const { deploymentTransition, deploymentEndNotice } = require('../src/services/operations/deploymentLifecycle')
const createDeploymentService = require('../src/services/operations/deploymentService')
const { serializeDeployment } = require('../src/services/operations/domain')

const start = new Date('2026-11-13T08:00:00Z'), end = new Date('2026-11-13T10:00:00Z')
const mid = new Date('2026-11-13T09:00:00Z')
const base = { assignmentId: 'DEP-TEST', personnelId: 'PNP-001', patrolArea: 'Centro', shiftStart: start, shiftEnd: end, status: 'active' }

it('records an early end with actor and actual time without changing the planned shift', () => {
	const { update } = deploymentTransition(base, 'ended_early', mid, { username: 'supervisor-01' })
	assert.deepEqual(update, { status: 'ended_early', endedAt: mid, endedBy: 'supervisor-01', endReason: 'supervisor_ended' })
	const serialized = serializeDeployment({ ...base, ...update })
	assert.equal(serialized.shiftEnd, end.toISOString())
	assert.equal(serialized.endedAt, mid.toISOString())
	assert.equal(serialized.isCurrentShift, false)
	assert.equal(deploymentEndNotice({ ...base, ...update }).title, 'Deployment ended early')
})

it('allows completion only at scheduled end, separates cancellation, and handles stale client clocks', () => {
	assert.match(deploymentTransition(base, 'completed', mid).error, /not finished/)
	assert.equal(deploymentTransition(base, 'completed', end).update.status, 'completed')
	assert.equal(deploymentTransition(base, 'ended_early', end).update.status, 'completed')
	assert.equal(deploymentTransition(base, 'cancelled', mid).update.status, 'ended_early')
	const scheduled = { ...base, status: 'scheduled' }, before = new Date(+start - 60_000)
	assert.equal(deploymentTransition(scheduled, 'cancelled', before).update.endReason, 'cancelled_before_start')
	assert.match(deploymentTransition(scheduled, 'active', before).error, /not started/)
	assert.match(deploymentTransition(scheduled, 'ended_early', before).error, /not started/)
	assert.equal(deploymentEndNotice({ status: 'completed' }).title, 'Shift completed')
	assert.equal(deploymentEndNotice({ status: 'cancelled' }).title, 'Scheduled deployment cancelled')
})

it('makes repeated endings idempotent and prevents reopening archived deployments', () => {
	for (const status of ['completed', 'ended_early', 'cancelled']) {
		assert.equal(deploymentTransition({ ...base, status }, status, mid).unchanged, true)
		assert.match(deploymentTransition({ ...base, status }, 'active', mid).error, /has ended/)
	}
	assert.equal(serializeDeployment({ ...base, status: 'completed' }).endedAt, undefined)
	assert.equal(serializeDeployment({ ...base, status: 'completed', endReason: 'scheduled_end' }).endedAt, end.toISOString())
})

const serviceFixture = () => {
	let record = { ...base }, writes = 0, concurrent = false
	const notices = []
	const query = rows => ({ sort: () => query(rows), lean: async () => rows })
	const service = createDeploymentService({
		clock: () => mid,
		io: { emit() {}, to: () => ({ emit() {} }) },
		models: {
			Deployment: {
				findOne: async () => ({ ...record }),
				findOneAndUpdate: async (filter, update) => {
					writes++
					assert.equal(filter.status, 'active')
					if (concurrent) return null
					record = { ...record, ...update.$set }; return record
				},
				find: () => query([]), updateMany: async () => ({ modifiedCount: 0 }), distinct: async () => [],
			},
			Personnel: { updateMany: async () => ({ modifiedCount: 0 }) },
		},
		loadPersonnelMap: async () => new Map(),
		personnelService: { emitPersonnelCollection() {}, getPersonnelWithLocations: async () => [] },
		notificationService: { deliverNotification: async notice => notices.push(notice) },
		publish: {},
	})
	return { service, notices, writes: () => writes, concurrent: () => { concurrent = true } }
}

it('rejects premature completion without writes and sends exactly one early-end notice on retry', async () => {
	const fixture = serviceFixture()
	assert.equal((await fixture.service.updateDeploymentStatus(base.assignmentId, 'completed')).status, 409)
	assert.equal(fixture.writes(), 0)
	const result = await fixture.service.updateDeploymentStatus(base.assignmentId, 'ended_early', { username: 'primary' })
	assert.equal(result.body.deployment.endedBy, 'primary')
	assert.equal(result.body.deployment.shiftEnd, end.toISOString())
	assert.equal((await fixture.service.updateDeploymentStatus(base.assignmentId, 'ended_early')).status, 200)
	assert.equal(fixture.writes(), 1)
	assert.equal(fixture.notices.length, 1)
	assert.equal(fixture.notices[0].title, 'Deployment ended early')
})

it('does not notify when another update wins the conditional end', async () => {
	const fixture = serviceFixture(); fixture.concurrent()
	assert.equal((await fixture.service.updateDeploymentStatus(base.assignmentId, 'ended_early')).status, 409)
	assert.equal(fixture.notices.length, 0)
})

it('notifies scheduled completion even when reconciliation broadcasts are disabled', async () => {
	const notices = [], audits = []
	const finishing = { ...base, status: 'active' }
	const finished = { ...base, status: 'completed', endReason: 'scheduled_end' }
	const queries = [[], [finishing], [finished]]
	let updates = 0
	const service = createDeploymentService({
		io: { emit() {} }, models: {
			Deployment: {
				find: () => ({ lean: async () => queries.shift() }),
				updateMany: async () => ({ modifiedCount: ++updates === 1 ? 1 : 0 }),
				distinct: async () => [],
			},
			Personnel: { updateMany: async () => ({ modifiedCount: 0 }) },
		},
		loadPersonnelMap: async () => new Map(), personnelService: {}, publish: {},
		notificationService: { deliverNotification: async notice => notices.push(notice) },
		auditService: { recordAudit: async audit => audits.push(audit) },
	})
	await service.reconcileDeploymentShifts({ broadcast: false, now: end })
	assert.equal(notices.length, 1)
	assert.equal(notices[0].title, 'Shift completed')
	assert.equal(notices[0].dedupeKey, 'deployment:DEP-TEST:status:completed')
	assert.equal(audits[0].changes.status.from, 'active')
})
