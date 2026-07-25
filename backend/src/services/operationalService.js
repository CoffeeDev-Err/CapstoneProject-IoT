const { randomUUID } = require('crypto')
const {
	Deployment,
	Report,
	Task,
} = require('../models')
const {
	barangayNameFromCode,
	getAreaCoordinates,
	normalizeBarangayCode,
	point,
	readCoordinates,
} = require('../utils/geo')
const {
	buildDateRange,
	createPaginationMeta,
	escapeRegex,
	parsePagination,
} = require('../utils/query')
const { getPersonnelMember } = require('./personnelService')
const { createNotification } = require('./notificationService')

const asDate = (value, fallback = new Date()) => {
	const date = value ? new Date(value) : fallback
	return Number.isNaN(date.getTime()) ? fallback : date
}

const optionalDate = (value) => {
	if (!value) return undefined
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? undefined : date
}

const serializeTask = (task) => ({
	id: task.taskId,
	type: task.type,
	title: task.title,
	description: task.description,
	location: task.locationName,
	...readCoordinates(task.location),
	requested_by: task.requestedBy,
	requester_name: task.requesterName,
	required_responders: task.requiredResponders,
	accepted_by: (task.responders || []).map((responder) => responder.personnelId),
	status: task.status,
	created_at: task.createdAt?.toISOString(),
	updated_at: task.updatedAt?.toISOString(),
	completed_at: task.completedAt?.toISOString(),
})

const serializeReport = (report) => ({
	id: report.reportNumber,
	personnel_id: report.submittedBy,
	officer: report.officerName,
	date_time: report.submittedAt?.toISOString(),
	occurred_at: report.incidentAt?.toISOString(),
	assigned_area: report.assignedArea,
	barangay: barangayNameFromCode(report.barangayCode),
	report_type: report.reportType,
	is_incident: report.isIncident,
	severity: report.severity,
	validation_status: report.validationStatus,
	case_status: report.caseStatus,
	title: report.title,
	description: report.description,
	location: report.locationName,
	...readCoordinates(report.location),
	...(report.resolution?.resolvedAt && {
		resolved_at: report.resolution.resolvedAt.toISOString(),
		resolved_by: report.resolution.resolvedBy,
		resolution_notes: report.resolution.notes,
	}),
})

const serializeDeployment = (deployment) => ({
	id: deployment.assignmentId,
	groupId: deployment.groupId,
	personnelId: deployment.personnelId,
	personnelName: deployment.personnelName,
	rank: deployment.rank,
	patrolArea: deployment.patrolArea,
	shiftStart: deployment.shiftStart?.toISOString(),
	shiftEnd: deployment.shiftEnd?.toISOString(),
	notes: deployment.instructions,
	assignedAt: deployment.assignedAt?.toISOString(),
	status: deployment.status,
	...readCoordinates(deployment.location),
})

const createNotFoundResult = (resource) => ({
	status: 404,
	body: { success: false, message: `${resource} not found.` },
})

const createOperationalService = ({ io }) => {
	const loadTasks = async () => (
		(await Task.find().sort({ createdAt: -1 }).lean()).map(serializeTask)
	)

	const loadReports = async (personnelId) => {
		const query = personnelId ? { submittedBy: personnelId } : {}
		return (await Report.find(query).sort({ submittedAt: -1, _id: -1 }).lean())
			.map(serializeReport)
	}

	const loadDeployments = async (personnelId) => {
		const query = {
			status: 'active',
			...(personnelId ? { personnelId } : {}),
		}
		return (await Deployment.find(query).sort({ assignedAt: -1 }).lean())
			.map(serializeDeployment)
	}

	const listTasks = async (query = {}) => {
		const pagination = parsePagination(query)
		const filter = {}
		if (['open', 'full', 'completed'].includes(query.status)) {
			filter.status = query.status
		}
		if (['backup', 'urgent'].includes(query.type)) filter.type = query.type
		if (query.personnel_id) {
			filter.$or = [
				{ requestedBy: String(query.personnel_id) },
				{ 'responders.personnelId': String(query.personnel_id) },
			]
		}
		if (query.search) {
			const pattern = new RegExp(escapeRegex(query.search), 'i')
			filter.$and = [{
				$or: [
					{ taskId: pattern },
					{ title: pattern },
					{ locationName: pattern },
					{ requesterName: pattern },
				],
			}]
		}

		const [documents, total] = await Promise.all([
			Task.find(filter)
				.sort({ createdAt: -1, _id: -1 })
				.skip(pagination.skip)
				.limit(pagination.limit)
				.lean(),
			Task.countDocuments(filter),
		])
		return {
			data: documents.map(serializeTask),
			pagination: createPaginationMeta({ ...pagination, total }),
		}
	}

	const getTask = async (taskId) => {
		const task = await Task.findOne({ taskId }).lean()
		return task ? serializeTask(task) : null
	}

	const completeTask = async (taskId, payload = {}) => {
		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		task.status = 'completed'
		task.completedAt = asDate(payload.completed_at)
		await task.save()
		const serialized = serializeTask(task)
		io.emit('task:updated', serialized)
		return { status: 200, body: { success: true, task: serialized } }
	}

	const listReports = async (query = {}) => {
		const pagination = parsePagination(query)
		const filter = {}
		if (query.personnel_id) filter.submittedBy = String(query.personnel_id)
		if (query.report_type) filter.reportType = String(query.report_type).toLowerCase()
		if (query.barangay) filter.barangayCode = normalizeBarangayCode(query.barangay)
		if (['open', 'resolved', 'not_applicable'].includes(query.case_status)) {
			filter.caseStatus = query.case_status
		}
		if (['pending', 'validated', 'rejected'].includes(query.validation_status)) {
			filter.validationStatus = query.validation_status
		}
		const dateRange = buildDateRange(query.from, query.to)
		if (dateRange) filter.submittedAt = dateRange
		if (query.search) {
			const pattern = new RegExp(escapeRegex(query.search), 'i')
			filter.$or = [
				{ reportNumber: pattern },
				{ officerName: pattern },
				{ title: pattern },
				{ assignedArea: pattern },
				{ locationName: pattern },
			]
		}

		const [documents, total] = await Promise.all([
			Report.find(filter)
				.sort({ submittedAt: -1, _id: -1 })
				.skip(pagination.skip)
				.limit(pagination.limit)
				.lean(),
			Report.countDocuments(filter),
		])
		return {
			data: documents.map(serializeReport),
			pagination: createPaginationMeta({ ...pagination, total }),
		}
	}

	const getReport = async (reportId) => {
		const report = await Report.findOne({ reportNumber: reportId }).lean()
		return report ? serializeReport(report) : null
	}

	const updateReportValidation = async (reportId, payload = {}) => {
		const validationStatus = String(payload.validation_status || '').toLowerCase()
		if (!['pending', 'validated', 'rejected'].includes(validationStatus)) {
			return {
				status: 400,
				body: {
					success: false,
					message: 'validation_status must be pending, validated, or rejected.',
				},
			}
		}
		const report = await Report.findOne({ reportNumber: reportId })
		if (!report) return createNotFoundResult('Report')
		report.validationStatus = validationStatus
		await report.save()
		const serialized = serializeReport(report)
		io.emit('report:updated', serialized)
		return { status: 200, body: { success: true, report: serialized } }
	}

	const listDeployments = async (query = {}) => {
		const pagination = parsePagination(query)
		const filter = {}
		if (query.personnel_id) filter.personnelId = String(query.personnel_id)
		if (query.barangay) filter.barangayCode = normalizeBarangayCode(query.barangay)
		if (['active', 'completed', 'cancelled'].includes(query.status)) {
			filter.status = query.status
		} else {
			filter.status = 'active'
		}
		const [documents, total] = await Promise.all([
			Deployment.find(filter)
				.sort({ assignedAt: -1, _id: -1 })
				.skip(pagination.skip)
				.limit(pagination.limit)
				.lean(),
			Deployment.countDocuments(filter),
		])
		return {
			data: documents.map(serializeDeployment),
			pagination: createPaginationMeta({ ...pagination, total }),
		}
	}

	const getDeployment = async (assignmentId) => {
		const deployment = await Deployment.findOne({ assignmentId }).lean()
		return deployment ? serializeDeployment(deployment) : null
	}

	const updateDeploymentStatus = async (assignmentId, status) => {
		if (!['active', 'completed', 'cancelled'].includes(status)) {
			return {
				status: 400,
				body: { success: false, message: 'Invalid deployment status.' },
			}
		}
		const deployment = await Deployment.findOneAndUpdate(
			{ assignmentId },
			{ $set: { status } },
			{ returnDocument: 'after' },
		)
		if (!deployment) return createNotFoundResult('Deployment')
		const activeDeployments = await loadDeployments()
		io.emit('deployments:updated', activeDeployments)
		return {
			status: 200,
			body: { success: true, deployment: serializeDeployment(deployment) },
		}
	}

	const createTask = async (payload = {}) => {
		const requester = payload.requested_by
			? await getPersonnelMember(payload.requested_by)
			: null
		const coordinates = {
			latitude: Number(payload.latitude ?? requester?.latitude ?? 17.4239),
			longitude: Number(payload.longitude ?? requester?.longitude ?? 121.7681),
		}
		const task = await Task.create({
			taskId: `TSK-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
			type: payload.type === 'urgent' ? 'urgent' : 'backup',
			title: payload.title || 'Backup requested',
			description: payload.description || 'Additional personnel assistance requested.',
			requestedBy: payload.requested_by || 'supervisor',
			requesterName: payload.requester_name || requester?.name || 'Duty Supervisor',
			requiredResponders: Math.max(1, Math.min(5, Number(payload.required_responders) || 3)),
			locationName: payload.location || requester?.locationName || 'Location unavailable',
			location: point(coordinates.longitude, coordinates.latitude),
			status: 'open',
		})
		const serialized = serializeTask(task)

		await createNotification({
			type: task.type === 'backup' ? 'emergency' : 'warning',
			title: task.type === 'backup' ? 'Backup Request' : 'Urgent Task',
			message: `${task.title} at ${task.locationName}.`,
			referenceType: 'task',
			referenceId: task.taskId,
		})
		io.emit('task:created', serialized)
		return serialized
	}

	const acceptTask = async (taskId, personnelId) => {
		if (!personnelId) {
			return { status: 400, body: { success: false, message: 'Personnel ID is required.' } }
		}

		const acceptedAt = new Date()
		let task = await Task.findOneAndUpdate(
			{
				taskId,
				status: 'open',
				requestedBy: { $ne: personnelId },
				'responders.personnelId': { $ne: personnelId },
				$expr: { $lt: [{ $size: '$responders' }, '$requiredResponders'] },
			},
			{
				$push: {
					responders: { personnelId, acceptedAt },
				},
			},
			{ returnDocument: 'after' },
		)

		if (!task) {
			task = await Task.findOne({ taskId })
			if (!task) {
				return { status: 404, body: { success: false, message: 'Task not found.' } }
			}
			if (task.type === 'backup' && task.requestedBy === personnelId) {
				return {
					status: 409,
					body: {
						success: false,
						message: 'The requester cannot accept their own backup request.',
					},
				}
			}
			if (task.responders.some((item) => item.personnelId === personnelId)) {
				return { status: 200, body: { success: true, task: serializeTask(task) } }
			}
			return {
				status: 409,
				body: {
					success: false,
					message: 'The response team is already full.',
					task: serializeTask(task),
				},
			}
		}

		if (task.responders.length >= task.requiredResponders) {
			task.status = 'full'
			await task.save()
		}

		const serialized = serializeTask(task)
		io.emit('task:updated', serialized)
		return { status: 200, body: { success: true, task: serialized } }
	}

	const submitReport = async (payload = {}) => {
		const officer = payload.personnel_id
			? await getPersonnelMember(payload.personnel_id)
			: null
		const reportType = String(payload.report_type || 'incident').toLowerCase()
		const isIncident = reportType === 'incident'
		const fallback = getAreaCoordinates(payload.assigned_area)
		const report = await Report.create({
			reportNumber: `RPT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
			submittedBy: payload.personnel_id || officer?.id || 'pcpl-001',
			officerName: payload.officer || officer?.name || 'Police Personnel',
			submittedAt: asDate(payload.date_time),
			incidentAt: asDate(payload.occurred_at),
			assignedArea: payload.assigned_area || 'Unassigned area',
			barangayCode: normalizeBarangayCode(payload.barangay),
			reportType,
			isIncident,
			severity: Math.max(1, Math.min(5, Number(payload.severity) || (isIncident ? 2 : 1))),
			validationStatus: 'pending',
			caseStatus: isIncident ? 'open' : 'not_applicable',
			title: payload.title || 'Submitted report',
			description: payload.description || '',
			locationName: payload.location || payload.assigned_area || 'Location unavailable',
			location: point(
				payload.longitude ?? fallback.longitude,
				payload.latitude ?? fallback.latitude,
			),
		})
		const serialized = serializeReport(report)

		await createNotification({
			type: 'info',
			title: 'New Police Report',
			message: `${report.officerName} submitted ${report.reportNumber}.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
		})
		io.emit('report:submitted', serialized)
		return serialized
	}

	const resolveReport = async (reportId, payload = {}) => {
		const report = await Report.findOne({ reportNumber: reportId })
		if (!report) {
			return { status: 404, body: { success: false, message: 'Report not found.' } }
		}
		if (!report.isIncident) {
			return {
				status: 409,
				body: { success: false, message: 'Only incident reports can be resolved.' },
			}
		}

		report.caseStatus = 'resolved'
		report.resolution = {
			resolvedAt: asDate(payload.resolved_at),
			resolvedBy: payload.resolved_by || report.submittedBy,
			notes: String(payload.resolution_notes || '').trim(),
		}
		await report.save()
		const serialized = serializeReport(report)

		await createNotification({
			type: 'success',
			title: 'Case Resolved',
			message: `${report.reportNumber} was marked resolved from the mobile app.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
		})
		io.emit('report:resolved', serialized)
		return { status: 200, body: { success: true, report: serialized } }
	}

	const replaceDeployments = async (payload = []) => {
		const assignmentIds = payload.map((item) => String(item.id))

		if (payload.length > 0) {
			await Deployment.bulkWrite(payload.map((assignment) => {
				const fallback = getAreaCoordinates(assignment.patrolArea)
				return {
					updateOne: {
						filter: { assignmentId: String(assignment.id) },
						update: {
							$set: {
								groupId: String(assignment.groupId || assignment.id),
								personnelId: assignment.personnelId,
								personnelName: assignment.personnelName,
								rank: assignment.rank,
								barangayCode: normalizeBarangayCode(assignment.patrolArea),
								patrolArea: assignment.patrolArea,
								shiftStart: optionalDate(assignment.shiftStart),
								shiftEnd: optionalDate(assignment.shiftEnd),
								instructions: assignment.notes || '',
								assignedBy: assignment.assignedBy || 'supervisor',
								assignedAt: asDate(assignment.assignedAt),
								location: point(
									assignment.longitude ?? fallback.longitude,
									assignment.latitude ?? fallback.latitude,
								),
								status: 'active',
							},
							$setOnInsert: { assignmentId: String(assignment.id) },
						},
						upsert: true,
					},
				}
			}))
		}

		await Deployment.updateMany(
			{
				status: 'active',
				...(assignmentIds.length > 0
					? { assignmentId: { $nin: assignmentIds } }
					: {}),
			},
			{ $set: { status: 'cancelled' } },
		)

		const deployments = await loadDeployments()
		await createNotification({
			title: 'Deployment Updated',
			message: `${deployments.length} active personnel assignment${deployments.length === 1 ? '' : 's'} synced.`,
			referenceType: 'deployment',
			referenceId: payload[0]?.groupId || 'active',
		})
		io.emit('deployments:updated', deployments)
		return deployments
	}

	const registerSocket = async (socket) => {
		const [tasks, reports, deployments] = await Promise.all([
			loadTasks(),
			loadReports(),
			loadDeployments(),
		])
		socket.emit('tasks:bootstrap', tasks)
		socket.emit('reports:bootstrap', reports)
		socket.emit('deployments:bootstrap', deployments)
	}

	return {
		acceptTask,
		completeTask,
		createTask,
		getDeployment,
		getReport,
		getTask,
		listDeployments,
		listReports,
		listTasks,
		loadDeployments,
		loadReports,
		loadTasks,
		registerSocket,
		replaceDeployments,
		resolveReport,
		submitReport,
		updateDeploymentStatus,
		updateReportValidation,
	}
}

module.exports = createOperationalService
