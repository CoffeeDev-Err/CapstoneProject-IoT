const { randomUUID } = require('crypto')
const { isValidCoordinates, point } = require('../../utils/geo')
const {
	buildPrefixSearchConditions,
	createPaginationMeta,
	parsePagination,
} = require('../../utils/query')
const {
	OPERATIONAL_LIMITS,
	createValidationError,
	validateOptionalNumber,
	validateText,
} = require('../../utils/operationalValidation')
const {
	activeShiftConditions,
	createNotFoundResult,
	serializeTask,
} = require('./domain')
const {
	canOfficerReadTask,
	getOfficerPersonnelId,
	isSupervisorActor,
	taskParticipantFilter,
	taskParticipantIds,
} = require('./access')
const { appendFilterCondition, findCursorPage } = require('./pagination')
const { emitTaskRemoval } = require('./events')

const createTaskService = ({
	io,
	models,
	loadPersonnelMap,
	personnelService,
	notificationService,
	clock = () => new Date(),
	idGenerator = randomUUID,
}) => {
	const { Deployment, Task } = models
	const { getPersonnelMember } = personnelService
	const { createNotification, deliverNotification } = notificationService

	const getOnDutyPersonnelIds = (now = clock()) => Deployment.distinct('personnelId', {
		status: 'active',
		$and: activeShiftConditions(now),
	})

	const isOfficerOnDuty = async (personnelId, now = clock()) => Boolean(
		personnelId && await Deployment.exists({
			personnelId,
			status: 'active',
			$and: activeShiftConditions(now),
		}),
	)

	const emitToAuthorizedOfficers = async (eventName, payload, task, activePersonnelIds) => {
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

	const loadTasks = async () => {
		const tasks = await Task.find().sort({ createdAt: -1 }).lean()
		const personnelById = await loadPersonnelMap(tasks.map((task) => task.requestedBy))
		return tasks.map((task) => serializeTask(task, personnelById))
	}

	const listTasks = async (query = {}, actor) => {
		const pagination = parsePagination(query)
		const filter = {}
		const officerPersonnelId = getOfficerPersonnelId(actor)
		const officerIsOnDuty = officerPersonnelId && query.view === 'active'
			? await isOfficerOnDuty(officerPersonnelId)
			: false
		if (query.view === 'active') filter.status = { $in: ['open', 'full'] }
		else if (query.view === 'history') filter.status = { $in: ['completed', 'cancelled'] }
		else if (query.view === 'accepted' && (officerPersonnelId || query.personnel_id)) {
			filter.status = { $in: ['open', 'full'] }
			filter['responders.personnelId'] = officerPersonnelId || String(query.personnel_id)
		} else if (['open', 'full', 'completed', 'cancelled'].includes(query.status)) {
			filter.status = query.status
		}
		if (['backup', 'urgent'].includes(query.type)) filter.type = query.type
		if (officerPersonnelId && query.view === 'active' && !officerIsOnDuty) {
			appendFilterCondition(filter, taskParticipantFilter(officerPersonnelId))
		} else if (officerPersonnelId && query.view !== 'active' && query.view !== 'accepted') {
			appendFilterCondition(filter, taskParticipantFilter(officerPersonnelId))
		} else if (isSupervisorActor(actor) && query.personnel_id && query.view !== 'accepted') {
			appendFilterCondition(filter, taskParticipantFilter(String(query.personnel_id)))
		}
		if (query.search) {
			buildPrefixSearchConditions(query.search, [
				'taskId', 'title', 'locationName', 'requesterName',
			]).forEach((condition) => appendFilterCondition(filter, condition))
		}

		if (query.pagination === 'cursor') {
			const cursorPage = await findCursorPage({
				model: Task,
				filter,
				dateField: 'createdAt',
				limit: Math.min(pagination.limit, 50),
				cursor: query.cursor,
			})
			const personnelById = await loadPersonnelMap(cursorPage.data.map((task) => task.requestedBy))
			return {
				data: cursorPage.data.map((task) => serializeTask(task, personnelById)),
				pagination: cursorPage.pagination,
			}
		}

		const [documents, total] = await Promise.all([
			Task.find(filter).sort({ createdAt: -1, _id: -1 })
				.skip(pagination.skip).limit(pagination.limit).lean(),
			Task.countDocuments(filter),
		])
		const personnelById = await loadPersonnelMap(documents.map((task) => task.requestedBy))
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
			return { status: 409, body: { success: false, message: 'A cancelled task cannot be completed.' } }
		}
		const previouslyEligiblePersonnelIds = await getOnDutyPersonnelIds()
		task.status = 'completed'
		task.completedAt = clock()
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
		emitTaskRemoval({ io, taskId: task.taskId, personnelIds: previouslyEligiblePersonnelIds })
		await emitToAuthorizedOfficers('task:updated', serialized, task)
		return { status: 200, body: { success: true, task: serialized } }
	}

	const cancelTask = async (taskId, personnelId) => {
		if (!personnelId) {
			return { status: 400, body: { success: false, message: 'Personnel ID is required.' } }
		}
		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		if (task.requestedBy !== personnelId) {
			return { status: 403, body: { success: false, message: 'Only the officer who requested backup can cancel it.' } }
		}
		if (task.type !== 'backup') {
			return { status: 409, body: { success: false, message: 'Only backup requests can be cancelled here.' } }
		}
		if (task.status === 'completed') {
			return { status: 409, body: { success: false, message: 'A completed backup request cannot be cancelled.' } }
		}
		const previouslyEligiblePersonnelIds = await getOnDutyPersonnelIds()
		if (task.status !== 'cancelled') {
			task.status = 'cancelled'
			task.cancelledAt = clock()
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
		emitTaskRemoval({ io, taskId: task.taskId, personnelIds: previouslyEligiblePersonnelIds })
		await emitToAuthorizedOfficers('task:updated', serialized, task)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, task: serialized } }
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
					$and: activeShiftConditions(clock()),
				}).select('patrolArea').lean()
				: null
			if (!activeDeployment) {
				const error = new Error('Backup requests are available only during your active deployment shift.')
				error.status = 409
				error.code = 'OFF_DUTY_BACKUP_REQUEST'
				throw error
			}
		}
		const requester = payload.requested_by ? await getPersonnelMember(payload.requested_by) : null
		if (taskType === 'backup' && !requester) {
			throw createValidationError('The requesting officer is unavailable.', 'requested_by')
		}
		if (taskType === 'backup' && (
			requester.latitude === null || requester.longitude === null || requester.isLocationStale
		)) {
			throw createValidationError(
				'A current GPS location is required before requesting backup.',
				'location',
				'CURRENT_LOCATION_REQUIRED',
			)
		}
		const coordinates = taskType === 'backup'
			? { latitude: Number(requester?.latitude), longitude: Number(requester?.longitude) }
			: { latitude: Number(payload.latitude), longitude: Number(payload.longitude) }
		if (!isValidCoordinates(coordinates.latitude, coordinates.longitude)) {
			const error = new Error('Valid latitude and longitude are required for the task location.')
			error.status = 400
			error.code = 'INVALID_TASK_COORDINATES'
			throw error
		}
		const title = taskType === 'backup'
			? `Backup requested by ${requester.name}`
			: validateText(payload.title, {
				field: 'title', label: 'Task title', maxLength: OPERATIONAL_LIMITS.taskTitle,
				required: true, allowNewlines: false,
			})
		const description = taskType === 'backup'
			? 'Additional personnel assistance requested from the officer current location.'
			: validateText(payload.description, {
				field: 'description', label: 'Task description', maxLength: OPERATIONAL_LIMITS.taskDescription,
			})
		const locationName = taskType === 'backup'
			? (requester.locationName || activeDeployment.patrolArea)
			: validateText(payload.location, {
				field: 'location', label: 'Task location', maxLength: OPERATIONAL_LIMITS.taskLocation,
				required: true, allowNewlines: false,
			})
		const requiredResponders = taskType === 'backup'
			? 3
			: validateOptionalNumber(payload.required_responders ?? 3, {
				field: 'required_responders', label: 'Required responders', min: 1, max: 5,
			})
		if (!Number.isInteger(requiredResponders)) {
			throw createValidationError(
				'Required responders must be a whole number between 1 and 5.',
				'required_responders',
			)
		}

		const createdAt = clock()
		const task = await Task.create({
			taskId: `TSK-${createdAt.getFullYear()}-${idGenerator().slice(0, 8).toUpperCase()}`,
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
			$and: activeShiftConditions(clock()),
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
		await emitToAuthorizedOfficers('task:created', serialized, task, eligiblePersonnelIds)
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
				body: { success: false, message: 'Only officers on an active deployment may accept this task.' },
			}
		}
		const acceptedAt = clock()
		let task = await Task.findOneAndUpdate({
			taskId,
			status: 'open',
			requestedBy: { $ne: personnelId },
			'responders.personnelId': { $ne: personnelId },
			$expr: { $lt: [{ $size: '$responders' }, '$requiredResponders'] },
		}, { $push: { responders: { personnelId, acceptedAt } } }, { returnDocument: 'after' })

		if (!task) {
			task = await Task.findOne({ taskId })
			if (!task) return { status: 404, body: { success: false, message: 'Task not found.' } }
			if (task.status === 'cancelled' || task.status === 'completed') {
				return { status: 409, body: { success: false, message: 'This task is no longer active.' } }
			}
			if (task.type === 'backup' && task.requestedBy === personnelId) {
				return { status: 409, body: { success: false, message: 'The requester cannot accept their own backup request.' } }
			}
			if (task.responders.some((item) => item.personnelId === personnelId)) {
				const personnelById = await loadPersonnelMap([task.requestedBy])
				return { status: 200, body: { success: true, task: serializeTask(task, personnelById) } }
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
		await emitToAuthorizedOfficers('task:updated', serialized, task)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, task: serialized } }
	}

	return {
		acceptTask,
		cancelTask,
		completeTask,
		createTask,
		getTask,
		listTasks,
		loadTasks,
	}
}

module.exports = createTaskService
