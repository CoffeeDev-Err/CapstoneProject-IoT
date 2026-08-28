const mongoose = require('mongoose')
const model = require('./modelFactory')

const auditLogSchema = new mongoose.Schema({
	actorUserId: { type: String, default: 'supervisor' },
	action: { type: String, required: true },
	entityType: { type: String, required: true },
	entityId: { type: String, required: true },
	changes: mongoose.Schema.Types.Mixed,
	ipAddress: String,
}, {
	collection: 'audit_logs',
	timestamps: { createdAt: true, updatedAt: false },
})
auditLogSchema.index({ actorUserId: 1, createdAt: -1 })
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })

module.exports = {
	AuditLog: model('AuditLog', auditLogSchema),
}
