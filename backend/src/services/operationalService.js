const { randomUUID } = require('crypto')
const {
	Deployment,
	Personnel,
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
	findCabaganBarangay,
	isCabaganBarangayCode,
} = require('../constants/cabaganBarangays')
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

const serializeTask = (task, personnelById = new Map()) => ({
	id: task.taskId,
	type: task.type,
	title: task.title,
	description: task.description,
	location: task.locationName,
	...readCoordinates(task.location),
	requested_by: task.requestedBy,
	requester_name: personnelById.get(task.requestedBy)?.fullName || task.requesterName,
	required_responders: task.requiredResponders,
	accepted_by: (task.responders || []).map((responder) => responder.personnelId),
	status: task.status,
	created_at: task.createdAt?.toISOString(),
	updated_at: task.updatedAt?.toISOString(),
	completed_at: task.completedAt?.toISOString(),
})

const serializeReport = (report, personnelById = new Map()) => ({
	id: report.reportNumber,
	personnel_id: report.submittedBy,
	officer: personnelById.get(report.submittedBy)?.fullName || report.officerName,
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
	location_source: report.locationSource || 'manual',
	is_within_cabagan: isCabaganBarangayCode(report.barangayCode),
	...(report.location?.coordinates?.length === 2
		? readCoordinates(report.location)
		: { latitude: null, longitude: null }),
	...(report.submittedFrom && {
		submitted_from: readCoordinates(report.submittedFrom),
	}),
	...(report.resolution?.resolvedAt && {
		resolved_at: report.resolution.resolvedAt.toISOString(),
		resolved_by: report.resolution.resolvedBy,
		resolution_notes: report.resolution.notes,
	}),
})

const serializeDeployment = (deployment, personnelById = new Map()) => ({
	id: deployment.assignmentId,
	groupId: deployment.groupId,
	personnelId: deployment.personnelId,
	personnelName: personnelById.get(deployment.personnelId)?.fullName
		|| deployment.personnelName,
	rank: personnelById.get(deployment.personnelId)?.rank || deployment.rank,
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

const loadPersonnelMap = async (personnelIds = []) => {
	const uniqueIds = [...new Set(personnelIds.filter(Boolean))]
	if (uniqueIds.length === 0) return new Map()

	const profiles = await Personnel.find({
		personnelId: { $in: uniqueIds },
	}).select('personnelId fullName rank').lean()
	return new Map(profiles.map((profile) => [profile.personnelId, profile]))
}

const createOperationalService = ({ io }) => {
	const loadTasks = async () => {
		const tasks = await Task.find().sort({ createdAt: -1 }).lean()
		const personnelById = await loadPersonnelMap(
			tasks.map((task) => task.requestedBy),
		)
		return tasks.map((task) => serializeTask(task, personnelById))
	}

	const loadReports = async (personnelId) => {
		const query = personnelId ? { submittedBy: personnelId } : {}
		const reports = await Report.find(query)
			.sort({ submittedAt: -1, _id: -1 })
			.lean()
		const personnelById = await loadPersonnelMap(
			reports.map((report) => report.submittedBy),
		)
		return reports.map((report) => serializeReport(report, personnelById))
	}

	const loadDeployments = async (personnelId) => {
		const query = {
			status: 'active',
			...(personnelId ? { personnelId } : {}),
		}
		const deployments = await Deployment.find(query).sort({ assignedAt: -1 }).lean()
		const personnelById = await loadPersonnelMap(
			deployments.map((deployment) => deployment.personnelId),
		)
		return deployments.map((deployment) => (
			serializeDeployment(deployment, personnelById)
		))
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
		const personnelById = await loadPersonnelMap(
			documents.map((task) => task.requestedBy),
		)
		return {
			data: documents.map((task) => serializeTask(task, personnelById)),
			pagination: createPaginationMeta({ ...pagination, total }),
		}
	}

	const getTask = async (taskId) => {
		const task = await Task.findOne({ taskId }).lean()
		if (!task) return null
		const personnelById = await loadPersonnelMap([task.requestedBy])
		return serializeTask(task, personnelById)
	}

	const completeTask = async (taskId, payload = {}) => {
		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		task.status = 'completed'
		task.completedAt = asDate(payload.completed_at)
		await task.save()
		const personnelById = await loadPersonnelMap([task.requestedBy])
		const serialized = serializeTask(task, personnelById)
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
		const personnelById = await loadPersonnelMap(
			documents.map((report) => report.submittedBy),
		)
		return {
			data: documents.map((report) => serializeReport(report, personnelById)),
			pagination: createPaginationMeta({ ...pagination, total }),
		}
	}

	const getReport = async (reportId) => {
		const report = await Report.findOne({ reportNumber: reportId }).lean()
		if (!report) return null
		const personnelById = await loadPersonnelMap([report.submittedBy])
		return serializeReport(report, personnelById)
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
		const personnelById = await loadPersonnelMap([report.submittedBy])
		const serialized = serializeReport(report, personnelById)
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
		const personnelById = await loadPersonnelMap(
			documents.map((deployment) => deployment.personnelId),
		)
		return {
			data: documents.map((deployment) => (
				serializeDeployment(deployment, personnelById)
			)),
			pagination: createPaginationMeta({ ...pagination, total }),
		}
	}

	const getDeployment = async (assignmentId) => {
		const deployment = await Deployment.findOne({ assignmentId }).lean()
		if (!deployment) return null
		const personnelById = await loadPersonnelMap([deployment.personnelId])
		return serializeDeployment(deployment, personnelById)
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
		const personnelById = await loadPersonnelMap([deployment.personnelId])
		io.emit('deployments:updated', activeDeployments)
		return {
			status: 200,
			body: {
				success: true,
				deployment: serializeDeployment(deployment, personnelById),
			},
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
			requesterName: requester?.name || payload.requester_name || 'Duty Supervisor',
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
		io.emit('dashboard:updated')
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
				const personnelById = await loadPersonnelMap([task.requestedBy])
				return {
					status: 200,
					body: { success: true, task: serializeTask(task, personnelById) },
				}
			}
			const personnelById = await loadPersonnelMap([task.requestedBy])
			return {
				status: 409,
				body: {
					success: false,
					message: 'The response team is already full.',
					task: serializeTask(task, personnelById),
				},
			}
		}

		if (task.responders.length >= task.requiredResponders) {
			task.status = 'full'
			await task.save()
		}

		const personnelById = await loadPersonnelMap([task.requestedBy])
		const serialized = serializeTask(task, personnelById)
		io.emit('task:updated', serialized)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, task: serialized } }
	}

	const submitReport = async (payload = {}) => {
		const officer = payload.personnel_id
			? await getPersonnelMember(payload.personnel_id)
			: null
		if (!officer) {
			const error = new Error('An active, GPS-linked personnel account is required to submit a report.')
			error.status = 400
			throw error
		}
		const reportType = String(payload.report_type || 'incident').toLowerCase()
		const isIncident = reportType === 'incident'
		const selectedBarangay = findCabaganBarangay(payload.barangay)
		if (!selectedBarangay) {
			const error = new Error(
				'Select one of the 26 official Cabagan barangays before submitting.',
			)
			error.status = 400
			throw error
		}

		const title = String(payload.title || '').trim()
		const description = String(payload.description || '').trim()
		const locationName = String(payload.location || '').trim()
		if (!title || !description || !locationName) {
			const error = new Error('Title, description, and exact incident location are required.')
			error.status = 400
			throw error
		}

		const locationSource = payload.location_source === 'gps' ? 'gps' : 'manual'
		const hasLatitude = payload.latitude !== null
			&& payload.latitude !== undefined
			&& payload.latitude !== ''
		const hasLongitude = payload.longitude !== null
			&& payload.longitude !== undefined
			&& payload.longitude !== ''
		const suppliedLatitude = hasLatitude ? Number(payload.latitude) : NaN
		const suppliedLongitude = hasLongitude ? Number(payload.longitude) : NaN
		const hasSuppliedCoordinates = hasLatitude
			&& hasLongitude
			&& Number.isFinite(suppliedLatitude)
			&& Number.isFinite(suppliedLongitude)
		if (locationSource === 'gps' && !hasSuppliedCoordinates) {
			const error = new Error(
				'Current GPS coordinates are unavailable. Enter the incident location manually.',
			)
			error.status = 400
			throw error
		}
		const report = await Report.create({
			reportNumber: `RPT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
			submittedBy: officer.id,
			officerName: officer.name,
			submittedAt: asDate(payload.date_time),
			incidentAt: asDate(payload.occurred_at),
			assignedArea: payload.assigned_area || 'Unassigned area',
			barangayCode: selectedBarangay.code,
			reportType,
			isIncident,
			severity: Math.max(1, Math.min(5, Number(payload.severity) || (isIncident ? 2 : 1))),
			validationStatus: 'pending',
			caseStatus: isIncident ? 'open' : 'not_applicable',
			title,
			description,
			locationName,
			locationSource,
			...(locationSource === 'gps' && {
				location: point(suppliedLongitude, suppliedLatitude),
				submittedFrom: point(suppliedLongitude, suppliedLatitude),
			}),
		})
		const personnelById = await loadPersonnelMap([report.submittedBy])
		const serialized = serializeReport(report, personnelById)

		await createNotification({
			type: 'info',
			title: 'New Police Report',
			message: `${report.officerName} submitted ${report.reportNumber}.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
		})
		io.emit('report:submitted', serialized)
		io.emit('dashboard:updated')
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
		if (
			payload.resolved_by
			&& report.submittedBy !== String(payload.resolved_by)
		) {
			return {
				status: 403,
				body: {
					success: false,
					message: 'Only the officer who submitted this incident can resolve it.',
				},
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
		io.emit('dashboard:updated')
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
		io.emit('dashboard:updated')
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
