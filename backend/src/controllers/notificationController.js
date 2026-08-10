const createNotificationController = (notificationService) => ({
	getMyNotifications: async (req, res) => {
		const notifications = await notificationService.getNotifications(
			req.auth.user.personnelId,
		)
		res.json({ notifications })
	},

	markMyNotificationRead: async (req, res) => {
		const notification = await notificationService.markNotificationRead(
			req.params.notificationId,
			req.auth.user.personnelId,
		)
		if (!notification) {
			return res.status(404).json({ success: false, message: 'Notification not found.' })
		}
		return res.json({ success: true, notification })
	},

	markAllMyNotificationsRead: async (req, res) => {
		const updated = await notificationService.markAllNotificationsRead(
			req.auth.user.personnelId,
		)
		res.json({ success: true, updated })
	},

	registerPushDevice: async (req, res) => {
		await notificationService.registerPushDevice({
			userId: req.auth.user._id,
			personnelId: req.auth.user.personnelId,
			expoPushToken: String(req.body?.expo_push_token || ''),
			platform: String(req.body?.platform || ''),
			deviceName: req.body?.device_name,
		})
		res.status(201).json({ success: true })
	},

	unregisterPushDevice: async (req, res) => {
		const removed = await notificationService.unregisterPushDevice({
			personnelId: req.auth.user.personnelId,
			expoPushToken: String(req.body?.expo_push_token || ''),
		})
		res.json({ success: true, removed })
	},

	getNotifications: async (req, res) => {
		const recipientId = String(req.query.recipient_id || 'supervisor')
		const notifications = await notificationService.getNotifications(recipientId)
		res.json({ notifications })
	},

	markRead: async (req, res) => {
		const notification = await notificationService.markNotificationRead(
			req.params.notificationId,
		)
		if (!notification) {
			return res.status(404).json({
				success: false,
				message: 'Notification not found.',
			})
		}
		return res.json({ success: true, notification })
	},
	markAllRead: async (req, res) => {
		const recipientId = String(req.body?.recipient_id || 'supervisor')
		const updated = await notificationService.markAllNotificationsRead(recipientId)
		res.json({ success: true, updated })
	},

	clearNotifications: async (req, res) => {
		const recipientId = String(req.query.recipient_id || 'supervisor')
		const deleted = await notificationService.deleteNotifications(recipientId)
		res.json({ success: true, deleted })
	},
})

module.exports = createNotificationController
