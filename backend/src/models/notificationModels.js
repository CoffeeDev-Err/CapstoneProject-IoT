const mongoose = require('mongoose')
const model = require('./modelFactory')

const notificationSchema = new mongoose.Schema({
	notificationId: { type: String, required: true },
	recipientId: { type: String, required: true, default: 'supervisor' },
	type: { type: String, default: 'info' },
	title: { type: String, required: true },
	message: { type: String, required: true },
	referenceType: String,
	referenceId: String,
	priority: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
	data: mongoose.Schema.Types.Mixed,
	dedupeKey: String,
	isRead: { type: Boolean, default: false },
	readAt: Date,
	// Saved with the notification so a crash cannot lose the intent to push.
	pushQueuePending: { type: Boolean, default: false },
}, {
	collection: 'notifications',
	timestamps: true,
})
notificationSchema.index({ notificationId: 1 }, { unique: true })
notificationSchema.index({ pushQueuePending: 1, createdAt: 1 }, {
	partialFilterExpression: { pushQueuePending: true },
})
notificationSchema.index({ recipientId: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, referenceType: 1, 'data.taskInbox': 1, isRead: 1 })
notificationSchema.index(
	{ recipientId: 1, dedupeKey: 1 },
	{ unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
)

const pushDeviceSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	personnelId: { type: String, required: true, trim: true },
	expoPushToken: { type: String, required: true, trim: true },
	platform: { type: String, enum: ['android', 'ios'], required: true },
	deviceName: { type: String, trim: true, default: '' },
	status: { type: String, enum: ['active', 'invalid', 'revoked'], default: 'active' },
	lastSeenAt: { type: Date, default: Date.now },
}, {
	collection: 'push_devices',
	timestamps: true,
})
pushDeviceSchema.index({ expoPushToken: 1 }, { unique: true })
pushDeviceSchema.index({ personnelId: 1, status: 1 })

const pushDeliverySchema = new mongoose.Schema({
	notificationId: { type: String, required: true },
	personnelId: { type: String, required: true },
	expoPushToken: { type: String, required: true },
	message: { type: mongoose.Schema.Types.Mixed, required: true },
	status: {
		type: String,
		enum: ['pending', 'awaiting_receipt', 'provider_accepted', 'failed', 'unknown', 'cancelled'],
		default: 'pending',
	},
	attempts: { type: Number, default: 0 },
	receiptChecks: { type: Number, default: 0 },
	nextAttemptAt: { type: Date, required: true },
	expiresAt: { type: Date, required: true },
	ticketId: String,
	ticketCreatedAt: Date,
	lastError: String,
	completedAt: Date,
	leaseId: String,
	leaseUntil: Date,
	// Retain terminal outcomes for troubleshooting, then remove payloads/tokens.
	purgeAt: Date,
}, { collection: 'push_deliveries', timestamps: true })
pushDeliverySchema.index({ notificationId: 1, expoPushToken: 1 }, { unique: true })
pushDeliverySchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 })
pushDeliverySchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

// One immutable broadcast and a durable fan-out queue. Individual notifications
// retain independent read state and use the existing persistent push queue.
const announcementSchema = new mongoose.Schema({
	_id: String,
	createdBy: { type: String, required: true },
	message: { type: String, required: true },
	location: { type: String, default: '' },
	when: { type: String, enum: ['immediately', 'scheduled'], required: true },
	eventAt: Date,
	recipientIds: [String],
	pendingRecipientIds: [String],
	completedAt: Date,
}, { collection: 'personnel_announcements', timestamps: true })
announcementSchema.index({ completedAt: 1, createdAt: 1 })

module.exports = {
	PersonnelAnnouncement: model('PersonnelAnnouncement', announcementSchema),
	Notification: model('Notification', notificationSchema),
	PushDevice: model('PushDevice', pushDeviceSchema),
	PushDelivery: model('PushDelivery', pushDeliverySchema),
}
