const { AuditLog } = require('../models')
const {
	buildDateRange,
	createPaginationMeta,
	parsePagination,
} = require('../utils/query')

const listAuditLogs = async (query = {}) => {
	const pagination = parsePagination(query)
	const filter = {}
	if (query.actor_user_id) filter.actorUserId = String(query.actor_user_id)
	if (query.entity_type) filter.entityType = String(query.entity_type)
	if (query.entity_id) filter.entityId = String(query.entity_id)
	if (query.action) filter.action = String(query.action)
	const createdAt = buildDateRange(query.from, query.to)
	if (createdAt) filter.createdAt = createdAt

	const [documents, total] = await Promise.all([
		AuditLog.find(filter)
			.sort({ createdAt: -1, _id: -1 })
			.skip(pagination.skip)
			.limit(pagination.limit)
			.lean(),
		AuditLog.countDocuments(filter),
	])
	return {
		data: documents.map((log) => ({
			id: String(log._id),
			actor_user_id: log.actorUserId,
			action: log.action,
			entity_type: log.entityType,
			entity_id: log.entityId,
			changes: log.changes,
			ip_address: log.ipAddress,
			created_at: log.createdAt?.toISOString(),
		})),
		pagination: createPaginationMeta({ ...pagination, total }),
	}
}

module.exports = { listAuditLogs }
