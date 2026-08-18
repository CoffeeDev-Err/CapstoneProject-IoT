// Supervisor endpoints are pinned to the shared supervisor stream. A
// client-supplied recipient id would otherwise let a supervisor read, mark, or
// delete any individual officer's notifications.
const SUPERVISOR_RECIPIENT = 'supervisor'

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
		const notifications = await notificationService.getNotifications(SUPERVISOR_RECIPIENT)
		res.json({ notifications })
	},

	markRead: async (req, res) => {
		const notification = await notificationService.markNotificationRead(
			req.params.notificationId,
			SUPERVISOR_RECIPIENT,
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
		const updated = await notificationService.markAllNotificationsRead(SUPERVISOR_RECIPIENT)
		res.json({ success: true, updated })
	},

	clearNotifications: async (req, res) => {
		const deleted = await notificationService.deleteNotifications(SUPERVISOR_RECIPIENT)
		res.json({ success: true, deleted })
	},
})

module.exports = createNotificationController
