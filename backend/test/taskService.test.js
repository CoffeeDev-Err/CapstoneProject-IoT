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
