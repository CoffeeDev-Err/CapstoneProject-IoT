const { randomUUID } = require('crypto')
const { Notification, PushDevice } = require('../models')
const { findCursorPage } = require('./operations/pagination')

const PERSONNEL_ROOM_PREFIX = 'personnel:'
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const toNotificationPayload = (notification) => ({
	id: notification.notificationId,
	type: notification.type,
	title: notification.title,
	message: notification.message,
	timestamp: notification.createdAt?.toISOString(),
	isRead: notification.isRead,
	referenceType: notification.referenceType,
	referenceId: notification.referenceId,
	priority: notification.priority || 'normal',
	data: notification.data || {},
})

const createNotificationRecord = async ({
	recipientId = 'supervisor',
	type = 'info',
	title,
	message,
	referenceType,
	referenceId,
	priority = 'normal',
	data = {},
	dedupeKey,
}) => {
	if (dedupeKey) {
		const existing = await Notification.findOne({ recipientId, dedupeKey }).lean()
		if (existing) return { notification: toNotificationPayload(existing), created: false }
	}

	try {
		const notification = await Notification.create({
			notificationId: `NOT-${randomUUID()}`,
			recipientId,
			type,
			title,
			message,
			referenceType,
			referenceId,
			priority,
			data,
			dedupeKey,
		})
		return { notification: toNotificationPayload(notification), created: true }
	} catch (error) {
		if (error?.code !== 11000 || !dedupeKey) throw error
		const existing = await Notification.findOne({ recipientId, dedupeKey }).lean()
		if (!existing) throw error
		return { notification: toNotificationPayload(existing), created: false }
	}
}

const createNotification = async (payload) => (
	(await createNotificationRecord(payload)).notification
)

const sendExpoPush = async (recipientId, notification) => {
	const devices = await PushDevice.find({ personnelId: recipientId, status: 'active' }).lean()
	if (devices.length === 0) return { attempted: 0 }

	const messages = devices.map((device) => ({
		to: device.expoPushToken,
		title: notification.title,
		body: notification.message,
		sound: notification.priority === 'low' ? null : 'default',
		priority: notification.priority === 'critical' || notification.priority === 'high'
			? 'high'
			: 'default',
		channelId: 'officer-alerts',
		data: {
			notificationId: notification.id,
			referenceType: notification.referenceType,
			referenceId: notification.referenceId,
			...notification.data,
		},
	}))

	try {
		const response = await fetch(EXPO_PUSH_URL, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(messages),
		})
		if (!response.ok) return { attempted: messages.length, accepted: 0 }

		const result = await response.json()
		const tickets = Array.isArray(result.data) ? result.data : [result.data]
		const invalidTokens = tickets.flatMap((ticket, index) => (
			ticket?.details?.error === 'DeviceNotRegistered'
				? [devices[index]?.expoPushToken]
				: []
		)).filter(Boolean)
		if (invalidTokens.length > 0) {
			await PushDevice.updateMany(
				{ expoPushToken: { $in: invalidTokens } },
				{ $set: { status: 'invalid' } },
			)
		}
		return { attempted: messages.length, accepted: messages.length - invalidTokens.length }
	} catch (error) {
		console.error('Expo push delivery failed:', error.message)
		return { attempted: messages.length, accepted: 0 }
	}
}

const deliverNotification = async ({ io, ...payload }) => {
	const result = await createNotificationRecord(payload)
	if (!result.created) return result.notification

	if (payload.recipientId && payload.recipientId !== 'supervisor') {
		io?.to(`${PERSONNEL_ROOM_PREFIX}${payload.recipientId}`)
			.emit('notification:created', result.notification)
		void sendExpoPush(payload.recipientId, result.notification).catch((error) => {
			console.error('Expo push delivery failed:', error.message)
		})
	}
	return result.notification
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

const getNotificationPage = async (recipientId, query = {}) => {
	const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 10))
	const recipientFilter = { recipientId: { $in: [recipientId, 'all'] } }
	const unreadCountPromise = Notification.countDocuments({
		...recipientFilter,
		isRead: false,
	})
	const page = await findCursorPage({
		model: Notification,
		filter: { ...recipientFilter },
		dateField: 'createdAt',
		limit,
		cursor: query.cursor,
	})
	return {
		notifications: page.data.map(toNotificationPayload),
		pagination: page.pagination,
		unreadCount: await unreadCountPromise,
	}
}

const markNotificationRead = async (notificationId, recipientId) => {
	const notification = await Notification.findOneAndUpdate(
		{
			notificationId,
			...(recipientId ? { recipientId: { $in: [recipientId, 'all'] } } : {}),
		},
		{ $set: { isRead: true, readAt: new Date() } },
		{ returnDocument: 'after' },
	)
	return notification ? toNotificationPayload(notification) : null
}

const markAllNotificationsRead = async (recipientId = 'supervisor') => {
	const result = await Notification.updateMany(
		{ recipientId: { $in: [recipientId, 'all'] }, isRead: false },
		{ $set: { isRead: true, readAt: new Date() } },
	)
	return result.modifiedCount
}

const deleteNotifications = async (recipientId = 'supervisor') => {
	const result = await Notification.deleteMany({ recipientId })
	return result.deletedCount
}

const registerPushDevice = async ({ userId, personnelId, expoPushToken, platform, deviceName }) => {
	if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(expoPushToken)) {
		const error = new Error('A valid Expo push token is required.')
		error.status = 400
		throw error
	}
	return PushDevice.findOneAndUpdate(
		{ expoPushToken },
		{
			$set: {
				userId,
				personnelId,
				platform,
				deviceName: String(deviceName || ''),
				status: 'active',
				lastSeenAt: new Date(),
			},
		},
		{ upsert: true, returnDocument: 'after' },
	)
}

const unregisterPushDevice = async ({ personnelId, expoPushToken }) => {
	const result = await PushDevice.updateOne(
		{ personnelId, expoPushToken },
		{ $set: { status: 'revoked' } },
	)
	return result.modifiedCount > 0
}

module.exports = {
	createNotification,
	deleteNotifications,
	deliverNotification,
	getNotificationPage,
	getNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	registerPushDevice,
	toNotificationPayload,
	unregisterPushDevice,
}
