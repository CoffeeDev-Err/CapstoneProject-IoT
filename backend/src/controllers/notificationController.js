const createNotificationController = (notificationService) => ({
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
		return res.json({ success: true, 
notification })
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
