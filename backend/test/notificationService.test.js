const assert = require('node:assert/strict')
const { it } = require('node:test')
const { Notification } = require('../src/models')
const notificationService = require('../src/services/notificationService')

it('saves push intent with the in-app notification before emitting realtime updates', async (t) => {
	let record
	const events = []
	t.mock.method(Notification, 'create', async (payload) => {
		record = { ...payload, createdAt: new Date() }
		return record
	})
	t.mock.method(global, 'fetch', async () => assert.fail('Delivery must use the persistent worker'))
	const io = { to: (room) => ({ emit: (event, payload) => {
		assert.equal(record.pushQueuePending, true)
		events.push({ room, event, payload })
	} }) }
	const result = await notificationService.deliverNotification({
		io, recipientId: 'PNP-001', title: 'Backup requested', message: 'Please respond',
	})
	assert.equal(events[0].room, 'personnel:PNP-001')
	assert.equal(events[0].payload.id, result.id)
	assert.equal(result.pushQueuePending, undefined)
	assert.equal(global.fetch.mock.callCount(), 0)
})

it('does not emit or enqueue a phantom notification if the database save fails', async (t) => {
	t.mock.method(Notification, 'create', async () => { throw new Error('DB unavailable') })
	await assert.rejects(notificationService.deliverNotification({
		io: { to: () => assert.fail('Must persist before emitting') },
		recipientId: 'PNP-001', title: 'Backup requested', message: 'Please respond',
	}), /DB unavailable/)
})

it('keeps the original pending push intent when a notification is deduplicated', async (t) => {
	const record = { notificationId: 'NOT-existing', pushQueuePending: true, createdAt: new Date() }
	t.mock.method(Notification, 'findOne', () => ({ lean: async () => record }))
	t.mock.method(Notification, 'create', async () => assert.fail('No duplicate notification'))
	const result = await notificationService.deliverNotification({
		io: { to: () => assert.fail('No duplicate socket event') },
		recipientId: 'PNP-001', dedupeKey: 'task-1', title: 'Backup', message: 'Respond',
	})
	assert.equal(result.id, 'NOT-existing')
	assert.equal(record.pushQueuePending, true)
})

it('does not enqueue pushes for supervisor or record-only notifications', async (t) => {
	const records = []
	t.mock.method(Notification, 'create', async (payload) => {
		records.push(payload)
		return { ...payload, createdAt: new Date() }
	})
	await notificationService.deliverNotification({ title: 'Review', message: 'New report' })
	await notificationService.createNotification({ recipientId: 'PNP-001', title: 'Info', message: 'Saved' })
	assert.deepEqual(records.map((record) => record.pushQueuePending), [false, false])
})

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

it('marks only new task inbox notifications as read for the authenticated officer', async () => {
	const originalUpdateMany = Notification.updateMany
	let capturedFilter
	Notification.updateMany = async (filter) => {
		capturedFilter = filter
		return { modifiedCount: 2 }
	}

	try {
		const updated = await notificationService.markTaskInboxNotificationsRead('PNP-001')
		assert.equal(updated, 2)
		assert.equal(capturedFilter.recipientId, 'PNP-001')
		assert.equal(capturedFilter.referenceType, 'task')
		assert.equal(capturedFilter.isRead, false)
		assert.deepEqual(capturedFilter.$or[0], { 'data.taskInbox': true })
	} finally {
		Notification.updateMany = originalUpdateMany
	}
})
