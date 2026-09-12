const assert = require('node:assert/strict')
const { it } = require('node:test')
const { Notification } = require('../src/models')
const notificationService = require('../src/services/notificationService')

it('hides legacy COP self-notifications from the supervisor feed', async () => {
	const originalFind = Notification.find
	let capturedFilter
	Notification.find = (filter) => {
		capturedFilter = filter
		return {
			sort() { return this },
			limit() { return this },
			lean: async () => [],
		}
	}

	try {
		await notificationService.getNotifications('supervisor')
		assert.deepEqual(capturedFilter.recipientId, { $in: ['supervisor', 'all'] })
		assert.deepEqual(capturedFilter.title.$nin.sort(), [
			'Deployment Updated',
			'Officer Account Created',
			'Report Review Updated',
		])
	} finally {
		Notification.find = originalFind
	}
})

it('does not apply the legacy supervisor filter to an officer feed', async () => {
	const originalFind = Notification.find
	let capturedFilter
	Notification.find = (filter) => {
		capturedFilter = filter
		return {
			sort() { return this },
			limit() { return this },
			lean: async () => [],
		}
	}

	try {
		await notificationService.getNotifications('PNP-001')
		assert.equal(capturedFilter.title, undefined)
	} finally {
		Notification.find = originalFind
	}
})
