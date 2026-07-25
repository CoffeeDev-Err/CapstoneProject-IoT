const { randomUUID } = require('crypto')
const { Notification } = require('../models')

const toNotificationPayload = (notification) => ({
	id: notification.notificationId,
	type: notification.type,
	title: notification.title,
	message: notification.message,
	timestamp: notification.createdAt?.toISOString(),
	isRead: notification.isRead,
	referenceType: notification.referenceType,
	referenceId: notification.referenceId,
})

const createNotification = async ({
	recipientId = 'supervisor',
	type = 'info',
	title,
	message,
	referenceType,
	referenceId,
}) => {
	const notification = await Notification.create({
		notificationId: `NOT-${randomUUID()}`,
		recipientId,
		type,
		title,
		message,
		referenceType,
		referenceId,
	})

	return toNotificationPayload(notification)
}

const getNotifications = async (recipientId = 'supervisor') => {
	const notifications = await Notification.find({
		recipientId: { $in: [recipientId, 'all'] },
	})
		.sort({ createdAt: -1 })
		.limit(100)
		.lean()

	return notifications.map(toNotificationPayload)
}

const markNotificationRead = async (notificationId) => {
	const notification = await Notification.findOneAndUpdate(
		{ notificationId },
		{ $set: { isRead: true, readAt: new Date() } },
		{ returnDocument: 'after' },
	)
	return notification ? toNotificationPayload(notification) : null
}

const markAllNotificationsRead = async (recipientId = 'supervisor') => {
	const result = await Notification.updateMany(
		{ recipientId, isRead: false },
		{ $set: { isRead: true, readAt: new Date() } },
	)
	return result.modifiedCount
}

const deleteNotifications = async (recipientId = 'supervisor') => {
	const result = await Notification.deleteMany({ recipientId })
	return result.deletedCount
}

module.exports = {
	createNotification,
	deleteNotifications,
	getNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	toNotificationPayload,
}
