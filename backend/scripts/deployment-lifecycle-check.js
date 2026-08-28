const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const { buildMockDeploymentSeedUpdate } = require('../src/services/seedService')
const {
	emitDeploymentCollection,
	emitTaskRemoval,
} = require('../src/services/operationalService')

const seedUpdate = buildMockDeploymentSeedUpdate()

assert.equal(seedUpdate.$set, undefined)
assert.equal(seedUpdate.$unset, undefined)
assert.equal(seedUpdate.$setOnInsert.assignmentId, 'ASG-CENTRO-002')
assert.equal(seedUpdate.$setOnInsert.status, 'active')

const emitted = []
const io = {
	to: (room) => ({
		emit: (eventName, payload) => emitted.push({ room, eventName, payload }),
	}),
}

emitDeploymentCollection({
	io,
	eventName: 'deployments:updated',
	deployments: [{ assignmentId: 'active-1', personnelId: 'officer-active' }],
	affectedPersonnelIds: ['officer-active', 'officer-scheduled'],
})

assert.deepEqual(
	emitted.find((entry) => entry.room === 'personnel:officer-active').payload,
	[{ assignmentId: 'active-1', personnelId: 'officer-active' }],
	'An active officer must receive only their scoped deployment collection',
)
assert.deepEqual(
	emitted.find((entry) => entry.room === 'personnel:officer-scheduled').payload,
	[],
	'A future-scheduled officer must receive an empty active collection that triggers an upcoming-shift refresh',
)

emitted.length = 0
emitDeploymentCollection({
	io,
	eventName: 'deployments:updated',
	deployments: [],
	affectedPersonnelIds: ['officer-cancelled'],
})
assert.deepEqual(
	emitted.find((entry) => entry.room === 'personnel:officer-cancelled').payload,
	[],
	'Cancelling the last deployment must notify the officer with an empty collection',
)

emitted.length = 0
emitTaskRemoval({
	io,
	taskId: 'task-cancelled',
	personnelIds: ['officer-requester', 'officer-visible', 'officer-visible'],
})
assert.deepEqual(
	emitted,
	[
		{
			room: 'personnel:officer-requester',
			eventName: 'task:removed',
			payload: { id: 'task-cancelled' },
		},
		{
			room: 'personnel:officer-visible',
			eventName: 'task:removed',
			payload: { id: 'task-cancelled' },
		},
	],
	'Cancelling or completing a backup must remove it from every previously eligible officer',
)

const serviceSource = fs.readFileSync(
	path.join(__dirname, '..', 'src', 'services', 'operations', 'deploymentService.js'),
	'utf8',
)
const taskServiceSource = fs.readFileSync(
	path.join(__dirname, '..', 'src', 'services', 'operations', 'taskService.js'),
	'utf8',
)
assert.match(
	serviceSource,
	/completingDeployments\.map\(\(deployment\) => deployment\.personnelId\)/,
	'Automatic shift completion must include the departing officer in realtime recipients',
)
assert.match(
	taskServiceSource,
	/completeTask[\s\S]*emitTaskRemoval\([\s\S]*emitToAuthorizedOfficers/,
	'Completing a backup must remove stale active cards before sending participant history updates',
)
assert.match(
	taskServiceSource,
	/cancelTask[\s\S]*emitTaskRemoval\([\s\S]*emitToAuthorizedOfficers/,
	'Cancelling a backup must remove stale active cards before sending participant history updates',
)

console.log('Backend deployment lifecycle checks passed.')
