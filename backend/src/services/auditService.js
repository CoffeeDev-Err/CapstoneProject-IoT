const { AuditLog } = require('../models')
const {
	buildDateRange,
	createPaginationMeta,
	parsePagination,
} = require('../utils/query')

const SENSITIVE_KEY = /(password|passphrase|otp|token|secret|authorization|cookie|hash)/i
const MAX_ARRAY_ITEMS = 100
const MAX_STRING_LENGTH = 500
const defaultCreateAuditLog = AuditLog.create

const sanitizeAuditValue = (value, depth = 0) => {
	if (value === undefined) return undefined
	if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
	if (value instanceof Date) return value
	if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH)
	if (depth >= 4) return '[truncated]'
	if (Array.isArray(value)) {
		return value.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeAuditValue(item, depth + 1))
			.filter((item) => item !== undefined)
	}
	if (typeof value !== 'object') return String(value).slice(0, MAX_STRING_LENGTH)
	return Object.fromEntries(Object.entries(value)
		.filter(([key]) => !SENSITIVE_KEY.test(key))
		.map(([key, item]) => [key, sanitizeAuditValue(item, depth + 1)])
		.filter(([, item]) => item !== undefined))
}

const actorFields = (actor = {}) => {
	const role = ['supervisor', 'officer'].includes(actor.role) ? actor.role : 'system'
	const personnelId = String(actor.personnelId || actor.personnel_id || '').trim()
	const actorId = String(actor.id || actor._id || actor.userId || personnelId || 'system').trim()
	return {
		actorUserId: actorId.slice(0, 100) || 'system',
		actorRole: role,
		...(personnelId && { actorPersonnelId: personnelId.slice(0, 100) }),
	}
}

const recordAudit = async ({
	actor,
	action,
	entityType,
	entityId,
	changes,
	ipAddress,
} = {}) => {
	try {
		const normalizedAction = String(action || '').trim().toLowerCase()
		const normalizedEntityType = String(entityType || '').trim().toLowerCase()
		const normalizedEntityId = String(entityId || '').trim()
		if (!normalizedAction || !normalizedEntityType || !normalizedEntityId) {
			throw new Error('Audit action, entity type, and entity ID are required.')
		}
		// Unit-level service tests run without MongoDB. Production requests reach
		// this point only after startup has established the database connection.
		if (AuditLog.db.readyState === 0 && AuditLog.create === defaultCreateAuditLog) return null
		return await AuditLog.create({
			...actorFields(actor),
			action: normalizedAction.slice(0, 100),
			entityType: normalizedEntityType.slice(0, 80),
			entityId: normalizedEntityId.slice(0, 150),
			changes: sanitizeAuditValue(changes || {}),
			...(ipAddress && { ipAddress: String(ipAddress).slice(0, 100) }),
		})
	} catch (error) {
		// The business action may already be committed. Do not report it as failed
		// solely because its secondary audit write was temporarily unavailable.
		console.error('Audit log write failed:', error.message)
		return null
	}
}

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
			actor_role: log.actorRole,
			actor_personnel_id: log.actorPersonnelId,
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

module.exports = { listAuditLogs, recordAudit, sanitizeAuditValue }
