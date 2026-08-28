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
}, {
	collection: 'notifications',
	timestamps: true,
})
notificationSchema.index({ notificationId: 1 }, { unique: true })
notificationSchema.index({ recipientId: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 })
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

module.exports = {
	Notification: model('Notification', notificationSchema),
	PushDevice: model('PushDevice', pushDeviceSchema),
}
