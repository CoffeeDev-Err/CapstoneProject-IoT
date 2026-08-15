const { createHash, randomUUID } = require('crypto')
const {
	CurrentLocation,
	Deployment,
	LocationHistory,
	Personnel,
	Report,
	Task,
} = require('../models')
const {
	barangayNameFromCode,
	distanceInMeters,
	getAreaCoordinates,
	isValidCoordinates,
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
const { isInsideCabagan } = require('../utils/cabaganGeofence')
const { getLocationStaleThresholdMs } = require('../utils/locationFreshness')
const {
	OPERATIONAL_LIMITS,
	createValidationError,
	validateDate,
	validateDeploymentId,
	validateOptionalNumber,
	validatePatrolArea,
	validateReportType,
	validateText,
} = require('../utils/operationalValidation')
const {
	emitPersonnelCollection,
	getPersonnelMember,
	getPersonnelWithLocations,
} = require('./personnelService')
const { createNotification, deliverNotification } = require('./notificationService')
const { toMediaAccessPath } = require('./mediaStorageService')

const asDate = (value, fallback = new Date()) => {
	const date = value ? new Date(value) : fallback
	return Number.isNaN(date.getTime()) ? fallback : date
}

const REPORT_ROUTE_BEFORE_MS = 30 * 60 * 1000
const REPORT_ROUTE_AFTER_MS = 15 * 60 * 1000
const REPORT_GPS_MAX_DISTANCE_METERS = 100
const MANAGEABLE_DEPLOYMENT_STATUSES = ['scheduled', 'active']
const DEPLOYMENT_STATUSES = [...MANAGEABLE_DEPLOYMENT_STATUSES, 'completed', 'cancelled']

const getReportRouteWindow = (report) => {
	const incidentAt = asDate(report.incidentAt)
	return {
		from: new Date(incidentAt.getTime() - REPORT_ROUTE_BEFORE_MS),
		to: new Date(incidentAt.getTime() + REPORT_ROUTE_AFTER_MS),
	}
}

const serializeRoutePoint = (entry) => ({
	latitude: entry.location.coordinates[1],
	longitude: entry.location.coordinates[0],
	accuracy: entry.accuracy ?? null,
	speed: entry.speed ?? null,
	heading: entry.heading ?? null,
	source: entry.source || 'gps',
	recorded_at: new Date(entry.recordedAt).toISOString(),
})

const activeShiftConditions = (now = new Date()) => ([
	{ $or: [{ shiftStart: { $exists: false } }, { shiftStart: null }, { shiftStart: { $lte: now } }] },
	{ $or: [{ shiftEnd: { $exists: false } }, { shiftEnd: null }, { shiftEnd: { $gt: now } }] },
])

const isDeploymentCurrent = (deployment, now = new Date()) => (
	deployment.status === 'active'
	&& (!deployment.shiftStart || new Date(deployment.shiftStart) <= now)
	&& (!deployment.shiftEnd || new Date(deployment.shiftEnd) > now)
)

const deploymentSignature = (deployment) => createHash('sha256')
	.update(JSON.stringify({
		personnelId: deployment.personnelId,
		patrolArea: deployment.patrolArea,
		shiftStart: deployment.shiftStart ? new Date(deployment.shiftStart).toISOString() : null,
		shiftEnd: deployment.shiftEnd ? new Date(deployment.shiftEnd).toISOString() : null,
		instructions: deployment.instructions || '',
		location: deployment.location?.coordinates || [],
	}))
	.digest('hex')

const deploymentNoticeSignature = (deployment) => createHash('sha256')
	.update(JSON.stringify({
		personnelId: deployment.personnelId,
		patrolArea: deployment.patrolArea,
		shiftStart: deployment.shiftStart ? new Date(deployment.shiftStart).toISOString() : null,
		shiftEnd: deployment.shiftEnd ? new Date(deployment.shiftEnd).toISOString() : null,
		instructions: deployment.instructions ?? deployment.notes ?? '',
		status: deployment.status,
	}))
	.digest('hex')

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
	cancelled_at: task.cancelledAt?.toISOString(),
})

const serializeReport = (report, personnelById = new Map()) => ({
	id: report.reportNumber,
	...(report.clientSubmissionId && { client_submission_id: report.clientSubmissionId }),
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
	...(report.evidencePhoto?.path && {
		evidence_photo: {
			url: toMediaAccessPath(report.evidencePhoto.path),
			mime_type: report.evidencePhoto.mimeType,
			size: report.evidencePhoto.size,
			camera_facing: report.evidencePhoto.cameraFacing,
			captured_at: report.evidencePhoto.capturedAt?.toISOString(),
		},
	}),
	...(report.resolution?.resolvedAt && {
		resolved_at: report.resolution.resolvedAt.toISOString(),
		resolved_by: report.resolution.resolvedBy,
		resolution_notes: report.resolution.notes,
	}),
	route_point_count: report.routeSnapshot?.length || 0,
	route_captured_at: report.routeSnapshotCapturedAt?.toISOString(),
})

const serializeDeployment = (deployment, personnelById = new Map()) => {
	const signature = deploymentSignature(deployment)
	const acknowledged = Boolean(
		deployment.acknowledgedAt
		&& deployment.acknowledgedSignature === signature,
	)

	return {
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
	isCurrentShift: isDeploymentCurrent(deployment),
	acknowledged,
	acknowledgedAt: acknowledged ? deployment.acknowledgedAt?.toISOString() : undefined,
	...readCoordinates(deployment.location),
	}
}

const createNotFoundResult = (resource) => ({
	status: 404,
	body: { success: false, message: `${resource} not found.` },
})

const appendFilterCondition = (filter, condition) => {
	filter.$and = [...(filter.$and || []), condition]
}

const isSupervisorActor = (actor) => !actor || actor.role === 'supervisor'

const getOfficerPersonnelId = (actor) => (
	actor?.role === 'officer' ? String(actor.personnelId || '').trim() : ''
)

const taskParticipantFilter = (personnelId) => ({
	$or: [
		{ requestedBy: personnelId },
		{ 'responders.personnelId': personnelId },
	],
})

const taskParticipantIds = (task) => [...new Set([
	task.requestedBy,
	...(task.responders || []).map((responder) => responder.personnelId),
])].filter((personnelId) => personnelId && personnelId !== 'supervisor')

const canOfficerReadTask = (task, personnelId, isOnDuty) => (
	taskParticipantIds(task).includes(personnelId)
	|| (Boolean(isOnDuty) && ['open', 'full'].includes(task.status))
)

const encodeCursor = (document, dateField) => Buffer.from(JSON.stringify({
	date: document[dateField]?.toISOString(),
	id: String(document._id),
})).toString('base64url')

const decodeCursor = (cursor) => {
	if (!cursor) return null
	try {
		const payload = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
		const date = new Date(payload.date)
		if (Number.isNaN(date.getTime()) || !/^[a-f\d]{24}$/i.test(payload.id)) return null
		return { date, id: payload.id }
	} catch {
		return null
	}
}

const findCursorPage = async ({ model, filter, dateField, limit, cursor }) => {
	const decodedCursor = decodeCursor(cursor)
	if (cursor && !decodedCursor) {
		const error = new Error('Invalid pagination cursor.')
		error.status = 400
		throw error
	}
	if (decodedCursor) {
		appendFilterCondition(filter, {
			$or: [
				{ [dateField]: { $lt: decodedCursor.date } },
				{ [dateField]: decodedCursor.date, _id: { $lt: decodedCursor.id } },
			],
		})
	}

	const documents = await model.find(filter)
		.sort({ [dateField]: -1, _id: -1 })
		.limit(limit + 1)
		.lean()
	const hasNextPage = documents.length > limit
	const data = hasNextPage ? documents.slice(0, limit) : documents

	return {
		data,
		pagination: {
			limit,
			hasNextPage,
			nextCursor: hasNextPage && data.length > 0
				? encodeCursor(data[data.length - 1], dateField)
				: null,
		},
	}
}

const loadPersonnelMap = async (personnelIds = []) => {
	const uniqueIds = [...new Set(personnelIds.filter(Boolean))]
	if (uniqueIds.length === 0) return new Map()

	const profiles = await Personnel.find({
		personnelId: { $in: uniqueIds },
	}).select('personnelId fullName rank').lean()
	return new Map(profiles.map((profile) => [profile.personnelId, profile]))
}

const createOperationalService = ({ io }) => {
	const emitToSupervisorAndPersonnel = (eventName, payload, personnelId) => {
		io.to('role:supervisor').emit(eventName, payload)
		if (personnelId) io.to(`personnel:${personnelId}`).emit(eventName, payload)
	}

	const emitDeploymentCollection = (eventName, deployments) => {
		io.to('role:supervisor').emit(eventName, deployments)
		const personnelIds = [...new Set(
			deployments.map((deployment) => deployment.personnelId).filter(Boolean),
		)]
		for (const personnelId of personnelIds) {
			io.to(`personnel:${personnelId}`).emit(
				eventName,
				deployments.filter((deployment) => deployment.personnelId === personnelId),
			)
		}
	}

	const getOnDutyPersonnelIds = (now = new Date()) => Deployment.distinct('personnelId', {
		status: 'active',
		$and: activeShiftConditions(now),
	})

	const isOfficerOnDuty = async (personnelId, now = new Date()) => Boolean(
		personnelId
		&& await Deployment.exists({
			personnelId,
			status: 'active',
			$and: activeShiftConditions(now),
		}),
	)

	const emitTaskToAuthorizedOfficers = async (
		eventName,
		payload,
		task,
		activePersonnelIds,
	) => {
		io.to('role:supervisor').emit(eventName, payload)
		const visiblePersonnelIds = new Set(taskParticipantIds(task))
		if (['open', 'full'].includes(task.status)) {
			const eligiblePersonnelIds = activePersonnelIds || await getOnDutyPersonnelIds()
			eligiblePersonnelIds.forEach((personnelId) => visiblePersonnelIds.add(personnelId))
		}
		for (const personnelId of visiblePersonnelIds) {
			io.to(`personnel:${personnelId}`).emit(eventName, payload)
		}
	}

	const captureReportRouteSnapshot = async (report) => {
		const { from, to } = getReportRouteWindow(report)
		const history = await LocationHistory.find({
			personnelId: report.submittedBy,
			recordedAt: { $gte: from, $lte: to },
			source: 'gps',
		}).sort({ recordedAt: 1 }).lean()

		const merged = new Map()
		for (const entry of [...(report.routeSnapshot || []), ...history]) {
			const coordinates = entry.location?.coordinates
			const recordedAt = new Date(entry.recordedAt)
			if (!Array.isArray(coordinates)
				|| coordinates.length !== 2
				|| Number.isNaN(recordedAt.getTime())) continue

			const key = `${recordedAt.toISOString()}:${coordinates.join(',')}`
			merged.set(key, {
				location: entry.location,
				accuracy: entry.accuracy,
				speed: entry.speed,
				heading: entry.heading,
				source: entry.source || 'gps',
				recordedAt,
			})
		}

		report.routeSnapshot = [...merged.values()]
			.sort((left, right) => left.recordedAt - right.recordedAt)
		report.routeSnapshotCapturedAt = new Date()
		await report.save()
		return { from, to, points: report.routeSnapshot }
	}

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
			...(personnelId ? {
				personnelId,
				$and: activeShiftConditions(new Date()),
			} : {}),
		}
		const deployments = await Deployment.find(query).sort({ assignedAt: -1 }).lean()
		const personnelById = await loadPersonnelMap(
			deployments.map((deployment) => deployment.personnelId),
		)
		return deployments.map((deployment) => (
			serializeDeployment(deployment, personnelById)
		))
	}

	const getUpcomingDeployment = async (personnelId, now = new Date()) => {
		if (!personnelId) return null

		const deployment = await Deployment.findOne({
			personnelId,
			status: 'scheduled',
			shiftStart: { $gt: now },
			shiftEnd: { $gt: now },
		})
			.sort({ shiftStart: 1, _id: 1 })
			.lean()
		if (!deployment) return null

		const personnelById = await loadPersonnelMap([personnelId])
		return serializeDeployment(deployment, personnelById)
	}

	const reconcileDeploymentShifts = async ({ broadcast = true, now = new Date() } = {}) => {
		const activatingDeployments = broadcast
			? await Deployment.find({
				status: 'scheduled',
				shiftStart: { $ne: null, $lte: now },
				shiftEnd: { $gt: now },
			}).lean()
			: []
		const completed = await Deployment.updateMany(
			{ status: { $in: MANAGEABLE_DEPLOYMENT_STATUSES }, shiftEnd: { $ne: null, $lte: now } },
			{ $set: { status: 'completed' } },
		)
		const activated = await Deployment.updateMany(
			{
				status: 'scheduled',
				shiftStart: { $ne: null, $lte: now },
				shiftEnd: { $gt: now },
			},
			{ $set: { status: 'active' } },
		)
		const onDutyPersonnelIds = await Deployment.distinct('personnelId', {
			status: 'active',
			$and: activeShiftConditions(now),
		})
		const [onDutyUpdate, offDutyUpdate] = await Promise.all([
			onDutyPersonnelIds.length > 0
				? Personnel.updateMany(
					{ status: 'active', personnelId: { $in: onDutyPersonnelIds }, dutyStatus: { $ne: 'On Duty' } },
					{ $set: { dutyStatus: 'On Duty' } },
				)
				: Promise.resolve({ modifiedCount: 0 }),
			Personnel.updateMany(
				{ status: 'active', personnelId: { $nin: onDutyPersonnelIds }, dutyStatus: { $ne: 'Off Duty' } },
				{ $set: { dutyStatus: 'Off Duty' } },
			),
		])
		const changed = completed.modifiedCount > 0
			|| activated.modifiedCount > 0
			|| onDutyUpdate.modifiedCount > 0
			|| offDutyUpdate.modifiedCount > 0

		if (broadcast && changed) {
			const [deployments, personnel] = await Promise.all([
				loadDeployments(),
				getPersonnelWithLocations(),
			])
			emitDeploymentCollection('deployments:updated', deployments)
			emitPersonnelCollection(io, 'personnel:update', personnel)
			io.emit('dashboard:updated')
		}

		if (broadcast && activatingDeployments.length > 0) {
			await Promise.all(activatingDeployments.map((deployment) => deliverNotification({
				io,
				recipientId: deployment.personnelId,
				type: 'deployment',
				title: 'Your Shift Is Now Active',
				message: `Your deployment at ${deployment.patrolArea} is now active. Open Map to confirm your assignment.`,
				referenceType: 'deployment',
				referenceId: deployment.assignmentId,
				priority: 'high',
				data: { destination: 'Map', assignmentId: deployment.assignmentId },
				dedupeKey: `deployment:${deployment.assignmentId}:active`,
			})))
		}

		if (broadcast) {
			const reminderMinutes = Math.max(5, Number(process.env.SHIFT_REMINDER_MINUTES) || 30)
			const reminderCutoff = new Date(now.getTime() + reminderMinutes * 60_000)
			const reminders = await Deployment.find({
				status: 'scheduled',
				shiftStart: { $gt: now, $lte: reminderCutoff },
				shiftEnd: { $gt: now },
			}).lean()
			for (const deployment of reminders) {
				const reminderKey = deployment.shiftStart.toISOString()
				if (deployment.upcomingReminderSentFor === reminderKey) continue
				const updated = await Deployment.updateOne(
					{ _id: deployment._id, upcomingReminderSentFor: { $ne: reminderKey } },
					{ $set: { upcomingReminderSentFor: reminderKey } },
				)
				if (updated.modifiedCount === 0) continue
				await deliverNotification({
					io,
					recipientId: deployment.personnelId,
					type: 'deployment',
					title: 'Upcoming Shift',
					message: `Your shift at ${deployment.patrolArea} starts in ${reminderMinutes} minutes or less.`,
					referenceType: 'deployment',
					referenceId: deployment.assignmentId,
					priority: 'high',
					data: { destination: 'Tasks', assignmentId: deployment.assignmentId },
					dedupeKey: `deployment:${deployment.assignmentId}:reminder:${reminderKey}`,
				})
			}
		}

		return { changed, onDutyPersonnelIds }
	}

	const acknowledgeDeployment = async (assignmentId, personnelId) => {
		const deployment = await Deployment.findOne({ assignmentId, status: 'active' })
		if (!deployment) return createNotFoundResult('Active deployment')
		if (deployment.personnelId !== personnelId) {
			return {
				status: 403,
				body: { success: false, message: 'You can only confirm your own assignment.' },
			}
		}
		if (!isDeploymentCurrent(deployment)) {
			return {
				status: 409,
				body: { success: false, message: 'This assignment is outside its active shift.' },
			}
		}

		deployment.acknowledgedSignature = deploymentSignature(deployment)
		deployment.acknowledgedAt = new Date()
		await deployment.save()
		const personnelById = await loadPersonnelMap([personnelId])
		const serialized = serializeDeployment(deployment, personnelById)
		emitToSupervisorAndPersonnel(
			'deployment:acknowledged',
			serialized,
			deployment.personnelId,
		)
		return { status: 200, body: { success: true, deployment: serialized } }
	}

	const listTasks = async (query = {}, actor) => {
		const pagination = parsePagination(query)
		const filter = {}
		const officerPersonnelId = getOfficerPersonnelId(actor)
		const officerIsOnDuty = officerPersonnelId && query.view === 'active'
			? await isOfficerOnDuty(officerPersonnelId)
			: false
		if (query.view === 'active') {
			filter.status = { $in: ['open', 'full'] }
		} else if (query.view === 'history') {
			filter.status = { $in: ['completed', 'cancelled'] }
		} else if (query.view === 'accepted' && (officerPersonnelId || query.personnel_id)) {
			filter.status = { $in: ['open', 'full'] }
			filter['responders.personnelId'] = officerPersonnelId || String(query.personnel_id)
		} else if (['open', 'full', 'completed', 'cancelled'].includes(query.status)) {
			filter.status = query.status
		}
		if (['backup', 'urgent'].includes(query.type)) filter.type = query.type
		if (
			officerPersonnelId
			&& query.view === 'active'
			&& !officerIsOnDuty
		) {
			appendFilterCondition(filter, taskParticipantFilter(officerPersonnelId))
		} else if (officerPersonnelId && query.view !== 'active' && query.view !== 'accepted') {
			appendFilterCondition(filter, taskParticipantFilter(officerPersonnelId))
		} else if (
			isSupervisorActor(actor)
			&& query.personnel_id
			&& query.view !== 'accepted'
		) {
			appendFilterCondition(filter, taskParticipantFilter(String(query.personnel_id)))
		}
		if (query.search) {
			const pattern = new RegExp(escapeRegex(query.search), 'i')
			appendFilterCondition(filter, {
				$or: [
					{ taskId: pattern },
					{ title: pattern },
					{ locationName: pattern },
					{ requesterName: pattern },
				],
			})
		}

		if (query.pagination === 'cursor') {
			const cursorPage = await findCursorPage({
				model: Task,
				filter,
				dateField: 'createdAt',
				limit: Math.min(pagination.limit, 50),
				cursor: query.cursor,
			})
			const personnelById = await loadPersonnelMap(
				cursorPage.data.map((task) => task.requestedBy),
			)
			return {
				data: cursorPage.data.map((task) => serializeTask(task, personnelById)),
				pagination: cursorPage.pagination,
			}
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

	const getTask = async (taskId, actor) => {
		const task = await Task.findOne({ taskId }).lean()
		if (!task) return null
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (officerPersonnelId) {
			const officerIsOnDuty = await isOfficerOnDuty(officerPersonnelId)
			if (!canOfficerReadTask(task, officerPersonnelId, officerIsOnDuty)) return null
		}
		const personnelById = await loadPersonnelMap([task.requestedBy])
		return serializeTask(task, personnelById)
	}

	const completeTask = async (taskId) => {
		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		if (task.status === 'cancelled') {
			return {
				status: 409,
				body: { success: false, message: 'A cancelled task cannot be completed.' },
			}
		}
		task.status = 'completed'
		task.completedAt = new Date()
		await task.save()
		const personnelById = await loadPersonnelMap([task.requestedBy])
		const serialized = serializeTask(task, personnelById)
		const recipients = [...new Set([
			task.requestedBy,
			...(task.responders || []).map((responder) => responder.personnelId),
		])].filter((personnelId) => personnelId && personnelId !== 'supervisor')
		await Promise.all(recipients.map((recipientId) => deliverNotification({
			io,
			recipientId,
			type: 'success',
			title: 'Task Completed',
			message: `${task.title} has been marked completed.`,
			referenceType: 'task',
			referenceId: task.taskId,
			priority: 'normal',
			data: { destination: 'Tasks', taskId: task.taskId },
			dedupeKey: `task:${task.taskId}:completed`,
		})))
		await emitTaskToAuthorizedOfficers('task:updated', serialized, task)
		return { status: 200, body: { success: true, task: serialized } }
	}

	const cancelTask = async (taskId, personnelId) => {
		if (!personnelId) {
			return { status: 400, body: { success: false, message: 'Personnel ID is required.' } }
		}

		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		if (task.requestedBy !== personnelId) {
			return {
				status: 403,
				body: {
					success: false,
					message: 'Only the officer who requested backup can cancel it.',
				},
			}
		}
		if (task.type !== 'backup') {
			return {
				status: 409,
				body: { success: false, message: 'Only backup requests can be cancelled here.' },
			}
		}
		if (task.status === 'completed') {
			return {
				status: 409,
				body: { success: false, message: 'A completed backup request cannot be cancelled.' },
			}
		}

		if (task.status !== 'cancelled') {
			task.status = 'cancelled'
			task.cancelledAt = new Date()
			await task.save()
		}

		const personnelById = await loadPersonnelMap([task.requestedBy])
		const serialized = serializeTask(task, personnelById)
		await Promise.all((task.responders || []).map((responder) => deliverNotification({
			io,
			recipientId: responder.personnelId,
			type: 'warning',
			title: 'Backup Request Cancelled',
			message: `${task.title} has been cancelled by the requesting officer.`,
			referenceType: 'task',
			referenceId: task.taskId,
			priority: 'high',
			data: { destination: 'Tasks', taskId: task.taskId },
			dedupeKey: `task:${task.taskId}:cancelled`,
		})))
		await emitTaskToAuthorizedOfficers('task:updated', serialized, task)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, task: serialized } }
	}

	const listReports = async (query = {}, actor) => {
		const pagination = parsePagination(query)
		const filter = {}
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (officerPersonnelId) filter.submittedBy = officerPersonnelId
		else if (query.personnel_id) filter.submittedBy = String(query.personnel_id)
		if (query.report_type) filter.reportType = String(query.report_type).toLowerCase()
		if (query.category === 'incident') filter.isIncident = true
		if (query.category === 'routine') filter.isIncident = false
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

		if (query.pagination === 'cursor') {
			const cursorPage = await findCursorPage({
				model: Report,
				filter,
				dateField: 'submittedAt',
				limit: Math.min(pagination.limit, 50),
				cursor: query.cursor,
			})
			const personnelById = await loadPersonnelMap(
				cursorPage.data.map((report) => report.submittedBy),
			)
			return {
				data: cursorPage.data.map((report) => serializeReport(report, personnelById)),
				pagination: cursorPage.pagination,
			}
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

	const getReport = async (reportId, actor) => {
		const officerPersonnelId = getOfficerPersonnelId(actor)
		const report = await Report.findOne({
			reportNumber: reportId,
			...(officerPersonnelId ? { submittedBy: officerPersonnelId } : {}),
		}).lean()
		if (!report) return null
		const personnelById = await loadPersonnelMap([report.submittedBy])
		return serializeReport(report, personnelById)
	}

	const getReportRoute = async (reportId) => {
		const report = await Report.findOne({ reportNumber: reportId })
		if (!report) return null
		const { from, to, points } = await captureReportRouteSnapshot(report)
		return {
			report_id: report.reportNumber,
			captured_at: report.routeSnapshotCapturedAt?.toISOString(),
			window: {
				from: from.toISOString(),
				to: to.toISOString(),
				complete: Date.now() >= to.getTime(),
			},
			points: points.map(serializeRoutePoint),
		}
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
		await createNotification({
			type: validationStatus === 'validated'
				? 'success'
				: validationStatus === 'rejected' ? 'warning' : 'info',
			title: 'Report Review Updated',
			message: `${report.reportNumber} was marked ${validationStatus} by the COP.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
		})
		await deliverNotification({
			io,
			recipientId: report.submittedBy,
			type: validationStatus === 'validated'
				? 'success'
				: validationStatus === 'rejected' ? 'warning' : 'info',
			title: 'Report Review Updated',
			message: `${report.reportNumber} was marked ${validationStatus} by the COP.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
			priority: validationStatus === 'rejected' ? 'high' : 'normal',
			data: { destination: 'Reports', reportId: report.reportNumber },
			dedupeKey: `report:${report.reportNumber}:validation:${validationStatus}`,
		})
		emitToSupervisorAndPersonnel('report:updated', serialized, report.submittedBy)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, report: serialized } }
	}

	const listDeployments = async (query = {}, actor) => {
		const pagination = parsePagination(query)
		const filter = {}
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (officerPersonnelId) filter.personnelId = officerPersonnelId
		else if (query.personnel_id) filter.personnelId = String(query.personnel_id)
		if (query.barangay) filter.barangayCode = normalizeBarangayCode(query.barangay)
		if (query.view === 'manageable') {
			filter.status = { $in: MANAGEABLE_DEPLOYMENT_STATUSES }
		} else if (DEPLOYMENT_STATUSES.includes(query.status)) {
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

	const getDeployment = async (assignmentId, actor) => {
		const officerPersonnelId = getOfficerPersonnelId(actor)
		const deployment = await Deployment.findOne({
			assignmentId,
			...(officerPersonnelId ? { personnelId: officerPersonnelId } : {}),
		}).lean()
		if (!deployment) return null
		const personnelById = await loadPersonnelMap([deployment.personnelId])
		return serializeDeployment(deployment, personnelById)
	}

	const updateDeploymentStatus = async (assignmentId, status) => {
		if (!DEPLOYMENT_STATUSES.includes(status)) {
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
		await reconcileDeploymentShifts({ broadcast: false })
		const [activeDeployments, personnel] = await Promise.all([
			loadDeployments(),
			getPersonnelWithLocations(),
		])
		const personnelById = await loadPersonnelMap([deployment.personnelId])
		const serialized = serializeDeployment(deployment, personnelById)
		await deliverNotification({
			io,
			recipientId: deployment.personnelId,
			type: status === 'cancelled' ? 'warning' : 'deployment',
			title: status === 'cancelled' ? 'Deployment Cancelled' : 'Deployment Status Updated',
			message: status === 'cancelled'
				? `Your deployment at ${deployment.patrolArea} has been cancelled.`
				: `Your deployment at ${deployment.patrolArea} is now ${status}.`,
			referenceType: 'deployment',
			referenceId: deployment.assignmentId,
			priority: status === 'cancelled' ? 'high' : 'normal',
			data: { destination: status === 'active' ? 'Map' : 'Tasks', assignmentId },
			dedupeKey: `deployment:${assignmentId}:status:${status}`,
		})
		emitDeploymentCollection('deployments:updated', activeDeployments)
		emitPersonnelCollection(io, 'personnel:update', personnel)
		return {
			status: 200,
			body: {
				success: true,
				deployment: serialized,
			},
		}
	}

	const createTask = async (payload = {}) => {
		const taskType = String(payload.type || '').trim().toLowerCase()
		if (!['backup', 'urgent'].includes(taskType)) {
			throw createValidationError('Task type must be backup or urgent.', 'type')
		}
		let activeDeployment
		if (taskType === 'backup') {
			const personnelId = String(payload.requested_by || '').trim()
			activeDeployment = personnelId
				? await Deployment.findOne({
					personnelId,
					status: 'active',
					$and: activeShiftConditions(new Date()),
				}).select('patrolArea').lean()
				: null

			if (!activeDeployment) {
				const error = new Error(
					'Backup requests are available only during your active deployment shift.',
				)
				error.status = 409
				error.code = 'OFF_DUTY_BACKUP_REQUEST'
				throw error
			}
		}

		const requester = payload.requested_by
			? await getPersonnelMember(payload.requested_by)
			: null
		if (taskType === 'backup' && !requester) {
			throw createValidationError('The requesting officer is unavailable.', 'requested_by')
		}
		if (
			taskType === 'backup'
			&& (
				requester.latitude === null
				|| requester.longitude === null
				|| requester.isLocationStale
			)
		) {
			throw createValidationError(
				'A current GPS location is required before requesting backup.',
				'location',
				'CURRENT_LOCATION_REQUIRED',
			)
		}
		const coordinates = taskType === 'backup'
			? {
				latitude: Number(requester?.latitude),
				longitude: Number(requester?.longitude),
			}
			: {
				latitude: Number(payload.latitude),
				longitude: Number(payload.longitude),
			}
		if (!isValidCoordinates(coordinates.latitude, coordinates.longitude)) {
			const error = new Error('Valid latitude and longitude are required for the task location.')
			error.status = 400
			error.code = 'INVALID_TASK_COORDINATES'
			throw error
		}
		const title = taskType === 'backup'
			? `Backup requested by ${requester.name}`
			: validateText(payload.title, {
				field: 'title',
				label: 'Task title',
				maxLength: OPERATIONAL_LIMITS.taskTitle,
				required: true,
				allowNewlines: false,
			})
		const description = taskType === 'backup'
			? 'Additional personnel assistance requested from the officer current location.'
			: validateText(payload.description, {
				field: 'description',
				label: 'Task description',
				maxLength: OPERATIONAL_LIMITS.taskDescription,
			})
		const locationName = taskType === 'backup'
			? (requester.locationName || activeDeployment.patrolArea)
			: validateText(payload.location, {
				field: 'location',
				label: 'Task location',
				maxLength: OPERATIONAL_LIMITS.taskLocation,
				required: true,
				allowNewlines: false,
			})
		const requiredResponders = taskType === 'backup'
			? 3
			: validateOptionalNumber(payload.required_responders ?? 3, {
				field: 'required_responders',
				label: 'Required responders',
				min: 1,
				max: 5,
			})
		if (!Number.isInteger(requiredResponders)) {
			throw createValidationError(
				'Required responders must be a whole number between 1 and 5.',
				'required_responders',
			)
		}

		const task = await Task.create({
			taskId: `TSK-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
			type: taskType,
			title,
			description,
			requestedBy: payload.requested_by || 'supervisor',
			requesterName: requester?.name || 'Duty Supervisor',
			requiredResponders,
			locationName,
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
		const eligiblePersonnelIds = await Deployment.distinct('personnelId', {
			status: 'active',
			$and: activeShiftConditions(new Date()),
			personnelId: { $ne: task.requestedBy },
		})
		await Promise.all(eligiblePersonnelIds.map((personnelId) => deliverNotification({
			io,
			recipientId: personnelId,
			type: task.type === 'backup' ? 'emergency' : 'warning',
			title: task.type === 'backup' ? 'Officer Requests Backup' : 'Urgent Task',
			message: `${task.title} at ${task.locationName}.`,
			referenceType: 'task',
			referenceId: task.taskId,
			priority: 'critical',
			data: { destination: 'Tasks', taskId: task.taskId },
			dedupeKey: `task:${task.taskId}:created`,
		})))
		await emitTaskToAuthorizedOfficers(
			'task:created',
			serialized,
			task,
			eligiblePersonnelIds,
		)
		io.emit('dashboard:updated')
		return serialized
	}

	const acceptTask = async (taskId, personnelId) => {
		if (!personnelId) {
			return { status: 400, body: { success: false, message: 'Personnel ID is required.' } }
		}
		if (!await isOfficerOnDuty(personnelId)) {
			return {
				status: 403,
				body: {
					success: false,
					message: 'Only officers on an active deployment may accept this task.',
				},
			}
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
			if (task.status === 'cancelled' || task.status === 'completed') {
				return {
					status: 409,
					body: {
						success: false,
						message: 'This task is no longer active.',
					},
				}
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
		if (task.requestedBy !== 'supervisor') {
			await deliverNotification({
				io,
				recipientId: task.requestedBy,
				type: 'task',
				title: 'Responder Accepted',
				message: `An officer accepted your request: ${task.title}.`,
				referenceType: 'task',
				referenceId: task.taskId,
				priority: 'normal',
				data: { destination: 'Tasks', taskId: task.taskId },
				dedupeKey: `task:${task.taskId}:accepted:${personnelId}`,
			})
		}
		await emitTaskToAuthorizedOfficers('task:updated', serialized, task)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, task: serialized } }
	}

	const getReportByClientSubmissionId = async (personnelId, rawSubmissionId) => {
		const clientSubmissionId = String(rawSubmissionId || '').trim()
		if (!clientSubmissionId) return null
		if (!/^mobile-[a-z0-9-]{10,100}$/i.test(clientSubmissionId)) {
			const error = new Error('The report submission identifier is invalid.')
			error.status = 400
			throw error
		}
		const report = await Report.findOne({
			submittedBy: personnelId,
			clientSubmissionId,
		})
		if (!report) return null
		const personnelById = await loadPersonnelMap([report.submittedBy])
		return serializeReport(report, personnelById)
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
		const now = new Date()
		const clientSubmissionId = String(payload.client_submission_id || '').trim()
		if (clientSubmissionId && !/^mobile-[a-z0-9-]{10,100}$/i.test(clientSubmissionId)) {
			const error = new Error('The report submission identifier is invalid.')
			error.status = 400
			throw error
		}
		const reportType = validateReportType(payload.report_type)
		const isIncident = reportType === 'incident'
		const selectedBarangay = findCabaganBarangay(payload.barangay)
		if (!selectedBarangay) {
			const error = new Error(
				'Select one of the 26 official Cabagan barangays before submitting.',
			)
			error.status = 400
			throw error
		}

		const title = validateText(payload.title, {
			field: 'title',
			label: 'Report title',
			maxLength: OPERATIONAL_LIMITS.reportTitle,
			required: true,
			allowNewlines: false,
		})
		const description = validateText(payload.description, {
			field: 'description',
			label: 'Report description',
			maxLength: OPERATIONAL_LIMITS.reportDescription,
			required: true,
		})
		const locationName = validateText(payload.location, {
			field: 'location',
			label: 'Exact incident location',
			maxLength: OPERATIONAL_LIMITS.reportLocation,
			required: true,
			allowNewlines: false,
		})
		const locationSource = String(payload.location_source || '').trim().toLowerCase()
		if (!['gps', 'manual'].includes(locationSource)) {
			throw createValidationError(
				'Location source must be gps or manual.',
				'location_source',
			)
		}
		const occurredAt = validateDate(payload.occurred_at || now, {
			field: 'occurred_at',
			label: 'Incident date and time',
			min: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
			max: new Date(now.getTime() + 5 * 60 * 1000),
		})
		const severity = validateOptionalNumber(payload.severity ?? (isIncident ? 2 : 1), {
			field: 'severity',
			label: 'Severity',
			min: 1,
			max: 5,
		})
		if (!Number.isInteger(severity)) {
			throw createValidationError('Severity must be a whole number from 1 to 5.', 'severity')
		}

		const [activeDeployment, currentLocation] = await Promise.all([
			Deployment.findOne({
				personnelId: officer.id,
				status: 'active',
				$and: activeShiftConditions(now),
			}).select('patrolArea').lean(),
			CurrentLocation.findOne({ personnelId: officer.id }).lean(),
		])
		const currentCoordinates = currentLocation?.location?.coordinates
		const hasCurrentCoordinates = Array.isArray(currentCoordinates)
			&& currentCoordinates.length === 2
			&& isValidCoordinates(Number(currentCoordinates[1]), Number(currentCoordinates[0]))
		const currentRecordedAt = new Date(currentLocation?.recordedAt || 0)
		const currentAgeMs = now.getTime() - currentRecordedAt.getTime()
		const hasFreshCurrentLocation = hasCurrentCoordinates
			&& Number.isFinite(currentAgeMs)
			&& currentAgeMs >= -5 * 60 * 1000
			&& currentAgeMs <= getLocationStaleThresholdMs()

		const hasLatitude = payload.latitude !== null
			&& payload.latitude !== undefined
			&& payload.latitude !== ''
		const hasLongitude = payload.longitude !== null
			&& payload.longitude !== undefined
			&& payload.longitude !== ''
		const suppliedLatitude = hasLatitude ? Number(payload.latitude) : undefined
		const suppliedLongitude = hasLongitude ? Number(payload.longitude) : undefined
		const hasValidSuppliedCoordinates = hasLatitude
			&& hasLongitude
			&& isValidCoordinates(suppliedLatitude, suppliedLongitude)
		if ((hasLatitude || hasLongitude) && !hasValidSuppliedCoordinates) {
			const error = new Error('Enter a valid latitude and longitude, or leave both coordinates empty.')
			error.status = 400
			error.code = 'INVALID_REPORT_COORDINATES'
			throw error
		}
		if (locationSource === 'gps' && !hasFreshCurrentLocation) {
			throw createValidationError(
				'Your server-verified GPS location is unavailable or stale. Use a manual incident location.',
				'location_source',
				'CURRENT_LOCATION_UNAVAILABLE',
			)
		}
		if (locationSource === 'gps' && !hasValidSuppliedCoordinates) {
			throw createValidationError(
				'Include the current device coordinates when using the GPS location source.',
				'location',
				'REPORT_GPS_COORDINATES_REQUIRED',
			)
		}
		if (
			locationSource === 'gps'
			&& distanceInMeters(
				currentCoordinates,
				[suppliedLongitude, suppliedLatitude],
			) > REPORT_GPS_MAX_DISTANCE_METERS
		) {
			throw createValidationError(
				`The submitted coordinates are more than ${REPORT_GPS_MAX_DISTANCE_METERS} meters from the latest server-verified GPS reading.`,
				'location',
				'REPORT_GPS_LOCATION_MISMATCH',
			)
		}
		const latitude = locationSource === 'gps'
			? Number(currentCoordinates[1])
			: suppliedLatitude
		const longitude = locationSource === 'gps'
			? Number(currentCoordinates[0])
			: suppliedLongitude
		const hasReportCoordinates = isValidCoordinates(latitude, longitude)
		if (hasReportCoordinates && !isInsideCabagan(latitude, longitude)) {
			throw createValidationError(
				'The selected incident coordinates must be inside Cabagan.',
				'location',
				'OUTSIDE_CABAGAN_REPORT_LOCATION',
			)
		}
		let evidencePhoto = payload.evidence_photo
		if (evidencePhoto) {
			evidencePhoto = {
				...evidencePhoto,
				capturedAt: validateDate(evidencePhoto.capturedAt || now, {
					field: 'evidence_captured_at',
					label: 'Evidence capture time',
					max: new Date(now.getTime() + 5 * 60 * 1000),
				}),
			}
		}
		const report = await Report.create({
			reportNumber: `RPT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
			...(clientSubmissionId && { clientSubmissionId }),
			submittedBy: officer.id,
			officerName: officer.name,
			submittedAt: now,
			incidentAt: occurredAt,
			assignedArea: activeDeployment?.patrolArea || 'Unassigned area',
			barangayCode: selectedBarangay.code,
			reportType,
			isIncident,
			severity,
			validationStatus: 'pending',
			caseStatus: isIncident ? 'open' : 'not_applicable',
			title,
			description,
			locationName,
			locationSource,
			...(hasReportCoordinates && {
				location: point(longitude, latitude),
			}),
			...(hasFreshCurrentLocation && {
				submittedFrom: point(currentCoordinates[0], currentCoordinates[1]),
			}),
			...(evidencePhoto && {
				evidencePhoto,
			}),
		})
		try {
			await captureReportRouteSnapshot(report)
			const personnelById = await loadPersonnelMap([report.submittedBy])
			const serialized = serializeReport(report, personnelById)

			await createNotification({
				type: 'info',
				title: 'New Police Report',
				message: `${report.officerName} submitted ${report.reportNumber}.`,
				referenceType: 'report',
				referenceId: report.reportNumber,
			})
			emitToSupervisorAndPersonnel('report:submitted', serialized, report.submittedBy)
			io.emit('dashboard:updated')
			return serialized
		} catch (error) {
			await Report.deleteOne({ _id: report._id }).catch(() => {})
			throw error
		}
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
			resolvedAt: new Date(),
			resolvedBy: payload.resolved_by || report.submittedBy,
			notes: validateText(payload.resolution_notes, {
				field: 'resolution_notes',
				label: 'Resolution notes',
				maxLength: OPERATIONAL_LIMITS.resolutionNotes,
			}),
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
		emitToSupervisorAndPersonnel('report:resolved', serialized, report.submittedBy)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, report: serialized } }
	}

	const replaceDeployments = async (payload = []) => {
		const now = new Date()
		if (!Array.isArray(payload)) {
			throw createValidationError('assignments must be an array.', 'assignments')
		}
		if (payload.length > OPERATIONAL_LIMITS.deploymentBatch) {
			throw createValidationError(
				`A maximum of ${OPERATIONAL_LIMITS.deploymentBatch} assignments may be saved at once.`,
				'assignments',
			)
		}
		const preliminarilyNormalized = payload.map((assignment) => {
			if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
				throw createValidationError('Each deployment must be an object.', 'assignments')
			}
			const status = String(assignment.status || '').trim().toLowerCase()
			if (!MANAGEABLE_DEPLOYMENT_STATUSES.includes(status)) {
				throw createValidationError(
					'Deployment status must be active or scheduled.',
					'status',
				)
			}
			const personnelId = String(assignment.personnelId || '').trim()
			if (!/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/i.test(personnelId)) {
				throw createValidationError('Select a valid personnel account.', 'personnelId')
			}
			return {
				id: validateDeploymentId(assignment.id),
				groupId: validateDeploymentId(assignment.groupId || assignment.id, 'groupId'),
				personnelId,
				patrolArea: validatePatrolArea(assignment.patrolArea),
				shiftStart: validateDate(assignment.shiftStart, {
					field: 'shiftStart',
					label: 'Shift start',
				}),
				shiftEnd: validateDate(assignment.shiftEnd, {
					field: 'shiftEnd',
					label: 'Shift end',
				}),
				notes: validateText(assignment.notes, {
					field: 'notes',
					label: 'Deployment instructions',
					maxLength: OPERATIONAL_LIMITS.deploymentInstructions,
				}),
				status,
			}
		})
		const requestedPersonnelIds = [...new Set(
			preliminarilyNormalized.map((assignment) => assignment.personnelId),
		)]
		const personnelProfiles = await Personnel.find({
			personnelId: { $in: requestedPersonnelIds },
			status: 'active',
		}).select('personnelId fullName rank').lean()
		const personnelById = new Map(
			personnelProfiles.map((profile) => [profile.personnelId, profile]),
		)
		const missingPersonnelId = requestedPersonnelIds.find((id) => !personnelById.has(id))
		if (missingPersonnelId) {
			throw createValidationError(
				'One or more selected personnel accounts are inactive or unavailable.',
				'personnelId',
			)
		}
		const normalizedAssignments = preliminarilyNormalized.map((assignment) => ({
			...assignment,
			personnelName: personnelById.get(assignment.personnelId).fullName,
			rank: personnelById.get(assignment.personnelId).rank,
		}))
		const assignmentIds = normalizedAssignments.map((item) => item.id)

		if (new Set(assignmentIds).size !== assignmentIds.length) {
			const error = new Error('Each deployment assignment must have a unique ID.')
			error.status = 400
			error.code = 'DUPLICATE_DEPLOYMENT_ID'
			throw error
		}

		for (const assignment of normalizedAssignments) {
			const { shiftStart, shiftEnd } = assignment

			if (shiftEnd <= shiftStart) {
				const error = new Error('Each deployment requires a valid shift end later than its shift start.')
				error.status = 400
				error.code = 'INVALID_DEPLOYMENT_SHIFT'
				throw error
			}

			if (assignment.status === 'scheduled' && shiftStart <= now) {
				const error = new Error('Scheduled deployments must start in the future.')
				error.status = 400
				error.code = 'INVALID_SCHEDULED_DEPLOYMENT_START'
				throw error
			}
			if (assignment.status === 'active' && shiftStart > new Date(now.getTime() + 5 * 60 * 1000)) {
				throw createValidationError(
					'An active deployment cannot start in the future.',
					'shiftStart',
			)
			}
			if (shiftEnd <= now) {
				throw createValidationError('Shift end must be in the future.', 'shiftEnd')
			}
			if (shiftEnd.getTime() - shiftStart.getTime() > 24 * 60 * 60 * 1000) {
				throw createValidationError(
					'A deployment shift must not exceed 24 hours.',
					'shiftEnd',
			)
			}
			if (shiftStart > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
				throw createValidationError(
					'A deployment cannot be scheduled more than one year ahead.',
					'shiftStart',
				)
			}
		}

		const assignmentsByPersonnel = new Map()
		normalizedAssignments.forEach((assignment) => {
			const personnelId = String(assignment.personnelId || '')
			const personnelAssignments = assignmentsByPersonnel.get(personnelId) || []
			personnelAssignments.push(assignment)
			assignmentsByPersonnel.set(personnelId, personnelAssignments)
		})

		for (const [personnelId, personnelAssignments] of assignmentsByPersonnel) {
			const orderedAssignments = personnelAssignments.sort((first, second) => (
				first.shiftStart.getTime() - second.shiftStart.getTime()
			))

			for (let index = 1; index < orderedAssignments.length; index += 1) {
				const previous = orderedAssignments[index - 1]
				const current = orderedAssignments[index]
				if (current.shiftStart < previous.shiftEnd) {
					const personnelName = current.personnelName || previous.personnelName || personnelId
					const error = new Error(
						`${personnelName} already has a deployment that overlaps this shift.`,
					)
					error.status = 409
					error.code = 'DEPLOYMENT_SHIFT_CONFLICT'
					throw error
				}
			}
		}
		const previousDeployments = await Deployment.find({
			$or: [
				{ assignmentId: { $in: assignmentIds } },
				{ status: { $in: MANAGEABLE_DEPLOYMENT_STATUSES } },
			],
		}).lean()
		const previousById = new Map(
			previousDeployments.map((deployment) => [deployment.assignmentId, deployment]),
		)

		if (normalizedAssignments.length > 0) {
			await Deployment.bulkWrite(normalizedAssignments.map((assignment) => {
				const fallback = getAreaCoordinates(assignment.patrolArea)
				const previous = previousById.get(assignment.id)
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
								shiftStart: assignment.shiftStart,
								shiftEnd: assignment.shiftEnd,
								instructions: assignment.notes || '',
								assignedBy: assignment.assignedBy || 'supervisor',
								assignedAt: previous?.assignedAt || now,
								location: point(
									assignment.longitude ?? fallback.longitude,
									assignment.latitude ?? fallback.latitude,
								),
								status: assignment.status,
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
				status: { $in: MANAGEABLE_DEPLOYMENT_STATUSES },
				...(assignmentIds.length > 0
					? { assignmentId: { $nin: assignmentIds } }
					: {}),
			},
			{ $set: { status: 'cancelled' } },
		)

		await reconcileDeploymentShifts({ broadcast: false })
		const [activeDeployments, manageablePayload, personnel] = await Promise.all([
			loadDeployments(),
			listDeployments({ view: 'manageable', limit: 100 }),
			getPersonnelWithLocations(),
		])
		await createNotification({
			title: 'Deployment Updated',
			message: `${manageablePayload.data.length} current or scheduled personnel assignment${manageablePayload.data.length === 1 ? '' : 's'} synced.`,
			referenceType: 'deployment',
			referenceId: normalizedAssignments[0]?.groupId || 'active',
		})
		for (const assignment of normalizedAssignments) {
			const previous = previousById.get(assignment.id)
			const signature = deploymentNoticeSignature(assignment)
			if (previous && deploymentNoticeSignature(previous) === signature) continue
			const scheduled = assignment.status === 'scheduled'
			const scheduleText = assignment.shiftStart.toLocaleString('en-PH', {
				dateStyle: 'medium',
				timeStyle: 'short',
				timeZone: 'Asia/Manila',
			})
			await deliverNotification({
				io,
				recipientId: assignment.personnelId,
				type: 'deployment',
				title: previous ? 'Deployment Updated' : (scheduled ? 'New Scheduled Shift' : 'New Deployment'),
				message: scheduled
					? `You are scheduled at ${assignment.patrolArea} on ${scheduleText}.`
					: `You are assigned to ${assignment.patrolArea}. Open Map to confirm your deployment.`,
				referenceType: 'deployment',
				referenceId: assignment.id,
				priority: 'high',
				data: { destination: scheduled ? 'Tasks' : 'Map', assignmentId: assignment.id },
				dedupeKey: `deployment:${assignment.id}:assignment:${signature}`,
			})
		}
		const cancelledDeployments = previousDeployments.filter((deployment) => (
			MANAGEABLE_DEPLOYMENT_STATUSES.includes(deployment.status)
			&& !assignmentIds.includes(deployment.assignmentId)
		))
		await Promise.all(cancelledDeployments.map((deployment) => deliverNotification({
			io,
			recipientId: deployment.personnelId,
			type: 'warning',
			title: 'Deployment Cancelled',
			message: `Your deployment at ${deployment.patrolArea} has been cancelled.`,
			referenceType: 'deployment',
			referenceId: deployment.assignmentId,
			priority: 'high',
			data: { destination: 'Tasks', assignmentId: deployment.assignmentId },
			dedupeKey: `deployment:${deployment.assignmentId}:cancelled`,
		})))
		emitDeploymentCollection('deployments:updated', activeDeployments)
		emitPersonnelCollection(io, 'personnel:update', personnel)
		io.emit('dashboard:updated')
		return manageablePayload.data
	}

	const registerSocket = async (socket, actor) => {
		const [taskPayload, deployments] = await Promise.all([
			listTasks({ view: 'active', limit: 100 }, actor),
			loadDeployments(getOfficerPersonnelId(actor) || undefined),
		])
		socket.emit('tasks:bootstrap', taskPayload.data)
		socket.emit('deployments:bootstrap', deployments)
	}

	return {
		acceptTask,
		acknowledgeDeployment,
		cancelTask,
		completeTask,
		createTask,
		getDeployment,
		getUpcomingDeployment,
		getReport,
		getReportByClientSubmissionId,
		getReportRoute,
		getTask,
		listDeployments,
		listReports,
		listTasks,
		loadDeployments,
		loadReports,
		loadTasks,
		registerSocket,
		reconcileDeploymentShifts,
		replaceDeployments,
		resolveReport,
		submitReport,
		updateDeploymentStatus,
		updateReportValidation,
	}
}

module.exports = createOperationalService
module.exports.canOfficerReadTask = canOfficerReadTask
module.exports.taskParticipantIds = taskParticipantIds
