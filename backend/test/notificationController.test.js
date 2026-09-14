const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createNotificationController = require('../src/controllers/notificationController')

const createResponse = () => ({
	body: undefined,
	json(body) {
		this.body = body
		return this
	},
})

describe('notification controller', () => {
	it('returns the authenticated officer notification page and forwards its cursor', async () => {
		const calls = []
		const page = {
			notifications: [{ id: 'NOT-1' }],
			pagination: { limit: 10, hasNextPage: true, nextCursor: 'next-page' },
			unreadCount: 14,
		}
		const controller = createNotificationController({
			getNotificationPage: async (recipientId, query) => {
				calls.push({ recipientId, query })
				return page
			},
		})
		const req = {
			auth: { user: { personnelId: '12-2004' } },
			query: { cursor: 'current-page', limit: '10', recipient_id: 'someone-else' },
		}
		const res = createResponse()

		await controller.getMyNotifications(req, res)

		assert.deepEqual(calls, [{ recipientId: '12-2004', query: req.query }])
		assert.deepEqual(res.body, page)
	})

	it('marks the authenticated officer task inbox as read', async () => {
		const calls = []
		const controller = createNotificationController({
			markTaskInboxNotificationsRead: async (recipientId) => {
				calls.push(recipientId)
				return 3
			},
		})
		const req = { auth: { user: { personnelId: '12-2004' } } }
		const res = createResponse()

		await controller.markMyTaskInboxRead(req, res)

		assert.deepEqual(calls, ['12-2004'])
		assert.deepEqual(res.body, { success: true, updated: 3 })
	})
})
