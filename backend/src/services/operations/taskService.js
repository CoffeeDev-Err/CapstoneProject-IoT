const { randomUUID } = require('crypto')
const { distanceInMeters, isValidCoordinates, point } = require('../../utils/geo')
const { getLocationFreshness } = require('../../utils/locationFreshness')
const { getLocalLocationName, resolveLocationName } = require('../reverseGeocodingService')
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
	isOfficerInTaskAudience,
	isSupervisorActor,
	taskOfficerAccessFilter,
	taskParticipantFilter,
	taskParticipantIds,
} = require('./access')
const { appendFilterCondition, findCursorPage } = require('./pagination')
const { emitTaskRemoval } = require('./events')

const BACKUP_LOCATION_FALLBACK = 'the current GPS position'
const BACKUP_NOTIFICATION_RADIUS_METERS = 1000
const isPlaceName = (value) => {
	const label = String(value || '').trim()
	return Boolean(label)
		&& label.length <= OPERATIONAL_LIMITS.taskLocation
		&& !/[\r\n]/.test(label)
		&& !/^GPS(?:\s|$)/i.test(label)
		&& !/^location unavailable$/i.test(label)
}

const getBackupLocationName = async ({ requester, coordinates, resolveLocation, budgetMs }) => {
	const localName = getLocalLocationName(coordinates.latitude, coordinates.longitude)
	if (localName) return localName
	if (isPlaceName(requester.locationName)) return requester.locationName.trim()

	let timeout
	try {
		const resolved = await Promise.race([
			Promise.resolve().then(() => resolveLocation(coordinates.latitude, coordinates.longitude)),
			new Promise((resolve) => { timeout = setTimeout(() => resolve(''), budgetMs) }),
		])
		return isPlaceName(resolved) ? resolved.trim() : BACKUP_LOCATION_FALLBACK
	} catch {
		return BACKUP_LOCATION_FALLBACK
	} finally {
		clearTimeout(timeout)
	}
}

const createTaskService = ({
	io,
	models,
	loadPersonnelMap,
	personnelService,
	notificationService,
	auditService = { recordAudit: async () => null },
	clock = () => new Date(),
	idGenerator = randomUUID,
	resolveBackupLocation = resolveLocationName,
	backupLocationBudgetMs = 750,
}) => {
	const { CurrentLocation, Deployment, Task } = models
	const { getPersonnelMember } = personnelService
	const { deliverNotification } = notificationService
	const { recordAudit } = auditService
	const backupArrivalRadiusMeters = Math.max(
		25,
		Number(process.env.BACKUP_ARRIVAL_RADIUS_METERS) || 200,
	)
	const loadTaskPersonnelMap = (tasks = []) => loadPersonnelMap(
		tasks.flatMap((task) => taskParticipantIds(task)),
	)
	const createActiveBackupError = () => {
		const error = new Error('You already have an active backup request. Open Tasks to view or cancel it.')
		error.status = 409
		error.code = 'ACTIVE_BACKUP_REQUEST_EXISTS'
		return error
	}

	const getOnDutyPersonnelIds = (now = clock()) => Deployment.distinct('personnelId', {
		status: 'active',
		$and: activeShiftConditions(now),
	})

	const selectBackupAudience = async ({ requesterId, latitude, longitude }) => {
		const onDutyPersonnelIds = (await getOnDutyPersonnelIds())
			.map(String)
			.filter((personnelId) => personnelId && personnelId !== requesterId)
		if (!CurrentLocation || onDutyPersonnelIds.length === 0) {
			return { personnelIds: onDutyPersonnelIds, mode: 'fallback_all' }
		}
		const locations = await CurrentLocation.find({
			personnelId: { $in: onDutyPersonnelIds },
			source: 'gps',
			isSimulated: { $ne: true },
		}).lean()
		const origin = [longitude, latitude]
		const nearbyPersonnelIds = locations.filter((location) => {
			const freshness = getLocationFreshness({
				recordedAt: location.recordedAt || location.updatedAt,
				source: location.source,
				now: clock(),
			})
			const coordinates = location.location?.coordinates || []
			return !freshness.isLocationStale
				&& location.positionValid !== false
				&& isValidCoordinates(coordinates[1], coordinates[0])
				&& distanceInMeters(origin, coordinates) <= BACKUP_NOTIFICATION_RADIUS_METERS
		}).map((location) => location.personnelId)
		return nearbyPersonnelIds.length > 0
			? { personnelIds: [...new Set(nearbyPersonnelIds)], mode: 'nearby' }
			: { personnelIds: onDutyPersonnelIds, mode: 'fallback_all' }
	}

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
			const eligiblePersonnelIds = activePersonnelIds
				|| (Array.isArray(task.eligiblePersonnelIds)
					? task.eligiblePersonnelIds
					: await getOnDutyPersonnelIds())
			eligiblePersonnelIds.forEach((personnelId) => visiblePersonnelIds.add(personnelId))
		}
		for (const personnelId of visiblePersonnelIds) {
			io.to(`personnel:${personnelId}`).emit(eventName, payload)
		}
	}

	const loadTasks = async () => {
		const tasks = await Task.find().sort({ createdAt: -1 }).lean()
		const personnelById = await loadTaskPersonnelMap(tasks)
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
		} else if (officerPersonnelId && query.view === 'active') {
			appendFilterCondition(filter, taskOfficerAccessFilter(officerPersonnelId))
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
			const personnelById = await loadTaskPersonnelMap(cursorPage.data)
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
		const personnelById = await loadTaskPersonnelMap(documents)
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
		const personnelById = await loadTaskPersonnelMap([task])
		return serializeTask(task, personnelById)
	}

	const reconcileTaskArrivals = async ({ personnelIds = [] } = {}) => {
		if (!CurrentLocation) return { checked: 0, arrived: 0 }
		const scopedPersonnelIds = [...new Set(personnelIds.map(String).filter(Boolean))]
		const scopedPersonnelIdSet = new Set(scopedPersonnelIds)
		const taskFilter = {
			type: 'backup',
			status: { $in: ['open', 'full'] },
			responders: {
				$elemMatch: {
					$or: [{ arrivedAt: { $exists: false } }, { arrivedAt: null }],
				},
			},
			...(scopedPersonnelIds.length > 0 && { $or: [
				{ 'responders.personnelId': { $in: scopedPersonnelIds } },
				{ requestedBy: { $in: scopedPersonnelIds } },
			] }),
		}
		const tasks = await Task.find(taskFilter).lean()
		const pendingResponderIds = [...new Set(tasks.flatMap((task) => (
			(task.responders || [])
				.filter((responder) => (
					!responder.arrivedAt
					&& (scopedPersonnelIdSet.size === 0
						|| scopedPersonnelIdSet.has(task.requestedBy)
						|| scopedPersonnelIdSet.has(responder.personnelId))
				))
				.map((responder) => responder.personnelId)
		)))]
		if (pendingResponderIds.length === 0) return { checked: 0, arrived: 0 }
		const requesterIds = [...new Set(tasks.map((task) => task.requestedBy).filter(Boolean))]

		const locations = await CurrentLocation.find({
			personnelId: { $in: [...new Set([...pendingResponderIds, ...requesterIds])] },
			source: 'gps',
			isSimulated: { $ne: true },
		}).lean()
		const locationsByPersonnelId = new Map(locations.map((location) => [location.personnelId, location]))
		let checked = 0
		let arrived = 0

		for (const task of tasks) {
			const requesterLocation = locationsByPersonnelId.get(task.requestedBy)
			if (!requesterLocation) continue
			const requesterFreshness = getLocationFreshness({
				recordedAt: requesterLocation.recordedAt || requesterLocation.updatedAt,
				source: requesterLocation.source,
				now: clock(),
			})
			const requesterCoordinates = requesterLocation.location?.coordinates || []
			if (requesterFreshness.isLocationStale
				|| requesterLocation.positionValid === false
				|| !isValidCoordinates(requesterCoordinates[1], requesterCoordinates[0])) continue
			for (const responder of task.responders || []) {
				if (
					responder.arrivedAt
					|| (scopedPersonnelIdSet.size > 0
						&& !scopedPersonnelIdSet.has(task.requestedBy)
						&& !scopedPersonnelIdSet.has(responder.personnelId))
				) continue
				const location = locationsByPersonnelId.get(responder.personnelId)
				if (!location) continue
				const freshness = getLocationFreshness({
					recordedAt: location.recordedAt || location.updatedAt,
					source: location.source,
					now: clock(),
				})
				if (freshness.isLocationStale) continue
				const responderCoordinates = location.location?.coordinates || []
				if (location.positionValid === false
					|| !isValidCoordinates(responderCoordinates[1], responderCoordinates[0])) continue
				checked += 1
				const distanceMeters = distanceInMeters(requesterCoordinates, responderCoordinates)
				if (!Number.isFinite(distanceMeters) || distanceMeters > backupArrivalRadiusMeters) continue

				const updatedTask = await Task.findOneAndUpdate(
					{
						taskId: task.taskId,
						status: { $in: ['open', 'full'] },
						responders: {
							$elemMatch: {
								personnelId: responder.personnelId,
								$or: [{ arrivedAt: { $exists: false } }, { arrivedAt: null }],
							},
						},
					},
					{
						$set: {
							'responders.$.arrivedAt': clock(),
							'responders.$.arrivalDistanceMeters': distanceMeters,
							'responders.$.arrivalLocation': point(responderCoordinates[0], responderCoordinates[1]),
						},
					},
					{ returnDocument: 'after' },
				)
				if (!updatedTask) continue
				arrived += 1
				const personnelById = await loadTaskPersonnelMap([updatedTask])
				const serialized = serializeTask(updatedTask, personnelById)
				const responderName = personnelById.get(responder.personnelId)?.fullName
					|| responder.personnelId
				await recordAudit({
					actor: { role: 'system' },
					action: 'task.responder_arrived',
					entityType: 'task',
					entityId: updatedTask.taskId,
					changes: {
						personnelId: responder.personnelId,
						arrivalDistanceMeters: Math.round(distanceMeters),
						status: updatedTask.status,
					},
				})
				const recipients = new Set([updatedTask.requestedBy, 'supervisor'])
				await Promise.all([...recipients].map((recipientId) => deliverNotification({
					io,
					recipientId,
					type: 'success',
					title: 'Responder Arrived',
					message: `${responderName} was automatically marked arrived within ${Math.round(backupArrivalRadiusMeters)} meters of the backup request point.`,
					referenceType: 'task',
					referenceId: updatedTask.taskId,
					priority: 'high',
					data: recipientId === 'supervisor'
						? {
							destination: 'Map',
							taskId: updatedTask.taskId,
							personnelId: responder.personnelId,
							latitude: serialized.latitude,
							longitude: serialized.longitude,
						}
						: { destination: 'Tasks', taskId: updatedTask.taskId },
					dedupeKey: `task:${updatedTask.taskId}:arrived:${responder.personnelId}`,
				})))
				await emitToAuthorizedOfficers('task:updated', serialized, updatedTask)
			}
		}
		if (arrived > 0) io.emit('dashboard:updated')
		return { checked, arrived }
	}

	const completeTask = async (taskId, actor) => {
		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (!isSupervisorActor(actor) && (
			task.type !== 'backup' || task.requestedBy !== officerPersonnelId
		)) {
			return {
				status: 403,
				body: { success: false, message: 'Only the requesting officer or the COP can complete this backup response.' },
			}
		}
		if (task.status === 'cancelled') {
			return { status: 409, body: { success: false, message: 'A cancelled task cannot be completed.' } }
		}
		if (task.status === 'completed') {
			const personnelById = await loadTaskPersonnelMap([task])
			return { status: 200, body: { success: true, task: serializeTask(task, personnelById) } }
		}
		if (task.type === 'backup' && !task.responders.some((responder) => responder.arrivedAt)) {
			return {
				status: 409,
				body: {
					success: false,
					code: 'BACKUP_ARRIVAL_REQUIRED',
					message: 'Wait for GeoSentri to detect at least one responder within the backup request area. Cancel the request if assistance is no longer needed before anyone arrives.',
				},
			}
		}
		const previouslyEligiblePersonnelIds = await getOnDutyPersonnelIds()
		const previousStatus = task.status
		task.status = 'completed'
		task.completedAt = clock()
		task.completedBy = officerPersonnelId || 'supervisor'
		task.activeRequestKey = undefined
		await task.save()
		await recordAudit({
			actor,
			action: 'task.completed',
			entityType: 'task',
			entityId: task.taskId,
			changes: {
				type: task.type,
				status: { from: previousStatus, to: 'completed' },
				responderCount: task.responders?.length || 0,
			},
		})
		const personnelById = await loadTaskPersonnelMap([task])
		const serialized = serializeTask(task, personnelById)
		const recipients = new Set(taskParticipantIds(task))
		if (officerPersonnelId) {
			recipients.delete(officerPersonnelId)
			recipients.add('supervisor')
		}
		await Promise.all([...recipients].map((recipientId) => deliverNotification({
			io,
			recipientId,
			type: 'success',
			title: 'Backup Response Completed',
			message: `${task.title} was completed ${officerPersonnelId ? 'by the requesting officer' : 'by the COP'}.`,
			referenceType: 'task',
			referenceId: task.taskId,
			priority: 'normal',
			data: { destination: 'Tasks', taskId: task.taskId },
			dedupeKey: `task:${task.taskId}:completed:${task.completedBy}`,
		})))
		emitTaskRemoval({ io, taskId: task.taskId, personnelIds: previouslyEligiblePersonnelIds })
		await emitToAuthorizedOfficers('task:updated', serialized, task)
		return { status: 200, body: { success: true, task: serialized } }
	}

	const cancelTask = async (taskId, personnelId, actor = { role: 'officer', personnelId }) => {
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
		const previousStatus = task.status
		if (previousStatus !== 'cancelled') {
			task.status = 'cancelled'
			task.cancelledAt = clock()
			task.activeRequestKey = undefined
			await task.save()
			await recordAudit({
				actor,
				action: 'task.cancelled',
				entityType: 'task',
				entityId: task.taskId,
				changes: { type: task.type, status: { from: previousStatus, to: 'cancelled' } },
			})
		}
		const personnelById = await loadTaskPersonnelMap([task])
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

	const createTask = async (payload = {}, actor = {}) => {
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
			const existingRequest = await Task.exists({
				type: 'backup',
				requestedBy: personnelId,
				status: { $in: ['open', 'full'] },
			})
			if (existingRequest) throw createActiveBackupError()
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
			? await getBackupLocationName({
				requester,
				coordinates,
				resolveLocation: resolveBackupLocation,
				budgetMs: backupLocationBudgetMs,
			})
			: validateText(payload.location, {
				field: 'location', label: 'Task location', maxLength: OPERATIONAL_LIMITS.taskLocation,
				required: true, allowNewlines: false,
			})
		const requiredResponders = validateOptionalNumber(payload.required_responders ?? 3, {
			field: 'required_responders', label: 'Required responders', min: 1, max: Number.MAX_SAFE_INTEGER,
		})
		if (!Number.isInteger(requiredResponders)) {
			throw createValidationError(
				'Required responders must be a positive whole number.',
				'required_responders',
			)
		}

		const audience = taskType === 'backup'
			? await selectBackupAudience({
				requesterId: String(payload.requested_by).trim(),
				latitude: coordinates.latitude,
				longitude: coordinates.longitude,
			})
			: null
		const createdAt = clock()
		let task
		try {
			task = await Task.create({
				taskId: `TSK-${createdAt.getFullYear()}-${idGenerator().slice(0, 8).toUpperCase()}`,
				...(taskType === 'backup' && {
					activeRequestKey: `backup:${String(payload.requested_by).trim()}`,
				}),
				type: taskType,
				title,
				description,
				requestedBy: payload.requested_by || 'supervisor',
				requesterName: requester?.name || 'Duty Supervisor',
				assignedArea: activeDeployment?.patrolArea || locationName,
				requiredResponders,
				...(audience && {
					eligiblePersonnelIds: audience.personnelIds,
					audienceMode: audience.mode,
				}),
				locationName,
				location: point(coordinates.longitude, coordinates.latitude),
				status: 'open',
			})
		} catch (error) {
			if (taskType === 'backup' && error?.code === 11000
				&& (error.keyPattern?.activeRequestKey || error.keyValue?.activeRequestKey)) {
				throw createActiveBackupError()
			}
			throw error
		}
		await recordAudit({
			actor: Object.keys(actor).length > 0 ? actor : task.requestedBy === 'supervisor'
				? { role: 'supervisor', id: 'supervisor' }
				: { role: 'officer', personnelId: task.requestedBy },
			action: task.type === 'backup' ? 'task.backup_requested' : 'task.created',
			entityType: 'task',
			entityId: task.taskId,
			changes: {
				type: task.type,
				status: task.status,
				requiredResponders: task.requiredResponders,
			},
		})
		const serialized = serializeTask(task)
		await deliverNotification({
			io,
			recipientId: 'supervisor',
			type: task.type === 'backup' ? 'emergency' : 'warning',
			title: task.type === 'backup' ? 'Backup Request' : 'Urgent Task',
			message: `${task.title} at ${task.locationName}.`,
			referenceType: 'task',
			referenceId: task.taskId,
			priority: task.type === 'backup' ? 'critical' : 'high',
			data: {
				destination: 'Map',
				taskId: task.taskId,
				personnelId: task.requestedBy,
				latitude: serialized.latitude,
				longitude: serialized.longitude,
			},
			dedupeKey: `task:${task.taskId}:supervisor-created`,
		})
		const eligiblePersonnelIds = audience?.personnelIds || await Deployment.distinct('personnelId', {
			status: 'active', $and: activeShiftConditions(clock()), personnelId: { $ne: task.requestedBy },
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
			data: { destination: 'Tasks', taskId: task.taskId, taskInbox: true },
			dedupeKey: `task:${task.taskId}:created`,
		})))
		await emitToAuthorizedOfficers('task:created', serialized, task, eligiblePersonnelIds)
		io.emit('dashboard:updated')
		return serialized
	}

	const acceptTask = async (taskId, personnelId, actor = { role: 'officer', personnelId }) => {
		if (!personnelId) {
			return { status: 400, body: { success: false, message: 'Personnel ID is required.' } }
		}
		if (!await isOfficerOnDuty(personnelId)) {
			return {
				status: 403,
				body: { success: false, message: 'Only officers on an active deployment may accept this task.' },
			}
		}
		const audienceTaskQuery = Task.findOne({ taskId })
		const audienceTask = typeof audienceTaskQuery?.lean === 'function'
			? await audienceTaskQuery.lean()
			: await audienceTaskQuery
		if (audienceTask?.type === 'backup'
			&& !isOfficerInTaskAudience(audienceTask, personnelId)
			&& audienceTask.requestedBy !== personnelId) {
			return { status: 403, body: { success: false, message: 'This backup request was not sent to your response group.' } }
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
				const personnelById = await loadTaskPersonnelMap([task])
				return { status: 200, body: { success: true, task: serializeTask(task, personnelById) } }
			}
			const personnelById = await loadTaskPersonnelMap([task])
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
		const personnelById = await loadTaskPersonnelMap([task])
		const serialized = serializeTask(task, personnelById)
		await recordAudit({
			actor,
			action: 'task.accepted',
			entityType: 'task',
			entityId: task.taskId,
			changes: {
				personnelId,
				status: task.status,
				responderCount: task.responders.length,
			},
		})
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
		const arrivalResult = await reconcileTaskArrivals({ personnelIds: [personnelId] })
		if (arrivalResult.arrived > 0) {
			const arrivedTask = await Task.findOne({ taskId })
			const arrivedPersonnelById = await loadTaskPersonnelMap([arrivedTask])
			return {
				status: 200,
				body: { success: true, task: serializeTask(arrivedTask, arrivedPersonnelById) },
			}
		}
		return { status: 200, body: { success: true, task: serialized } }
	}

	const expandTaskAudience = async (taskId, actor) => {
		const task = await Task.findOne({ taskId })
		if (!task) return createNotFoundResult('Task')
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (!isSupervisorActor(actor) && task.requestedBy !== officerPersonnelId) {
			return { status: 403, body: { success: false, message: 'Only the requesting officer or the COP can request more responders.' } }
		}
		if (task.type !== 'backup' || !['open', 'full'].includes(task.status)) {
			return { status: 409, body: { success: false, message: 'Only an active backup request can be expanded.' } }
		}
		const allOnDutyPersonnelIds = (await getOnDutyPersonnelIds())
			.map(String)
			.filter((personnelId) => personnelId && personnelId !== task.requestedBy)
		const existingAudience = new Set(task.eligiblePersonnelIds || [])
		const addedPersonnelIds = allOnDutyPersonnelIds.filter((personnelId) => !existingAudience.has(personnelId))
		task.eligiblePersonnelIds = allOnDutyPersonnelIds
		task.audienceMode = 'expanded_all'
		task.audienceExpandedAt = clock()
		await task.save()
		const personnelById = await loadTaskPersonnelMap([task])
		const serialized = serializeTask(task, personnelById)
		await Promise.all(addedPersonnelIds.map((personnelId) => deliverNotification({
			io,
			recipientId: personnelId,
			type: 'emergency',
			title: 'Additional Backup Responders Needed',
			message: `${task.title} at ${task.locationName}.`,
			referenceType: 'task',
			referenceId: task.taskId,
			priority: 'critical',
			data: { destination: 'Tasks', taskId: task.taskId, taskInbox: true },
			dedupeKey: `task:${task.taskId}:audience-expanded`,
		})))
		await recordAudit({
			actor,
			action: 'task.audience_expanded',
			entityType: 'task',
			entityId: task.taskId,
			changes: { addedPersonnelIds, eligibleCount: allOnDutyPersonnelIds.length },
		})
		await emitToAuthorizedOfficers('task:updated', serialized, task, allOnDutyPersonnelIds)
		return { status: 200, body: { success: true, added_count: addedPersonnelIds.length, task: serialized } }
	}

	const deactivatePersonnelTasks = async (personnelId, actor = { role: 'system' }) => {
		const normalizedPersonnelId = String(personnelId || '').trim()
		if (!normalizedPersonnelId) return { cancelled: 0, withdrawn: 0 }

		const tasks = await Task.find({
			status: { $in: ['open', 'full'] },
			$or: [
				{ requestedBy: normalizedPersonnelId },
				{ 'responders.personnelId': normalizedPersonnelId },
			],
		})
		if (tasks.length === 0) return { cancelled: 0, withdrawn: 0 }

		const previouslyEligiblePersonnelIds = await getOnDutyPersonnelIds()
		const remainingEligiblePersonnelIds = previouslyEligiblePersonnelIds.filter(
			(eligiblePersonnelId) => eligiblePersonnelId !== normalizedPersonnelId,
		)
		let cancelled = 0
		let withdrawn = 0
		for (const task of tasks) {
			const previousStatus = task.status
			let action
			let changes

			if (task.requestedBy === normalizedPersonnelId) {
				task.status = 'cancelled'
				task.cancelledAt = clock()
				task.activeRequestKey = undefined
				cancelled += 1
				action = 'task.cancelled_on_account_deactivation'
				changes = {
					personnelId: normalizedPersonnelId,
					status: { from: previousStatus, to: 'cancelled' },
				}
			} else {
				task.responders = (task.responders || []).filter(
					(responder) => responder.personnelId !== normalizedPersonnelId,
				)
				if (task.status === 'full' && task.responders.length < task.requiredResponders) {
					task.status = 'open'
				}
				withdrawn += 1
				action = 'task.responder_withdrawn_on_account_deactivation'
				changes = {
					personnelId: normalizedPersonnelId,
					status: { from: previousStatus, to: task.status },
					responderCount: task.responders.length,
				}
			}

			await task.save()
			await recordAudit({
				actor,
				action,
				entityType: 'task',
				entityId: task.taskId,
				changes,
			})
			const personnelById = await loadTaskPersonnelMap([task])
			const serialized = serializeTask(task, personnelById)
			emitTaskRemoval({
				io,
				taskId: task.taskId,
				personnelIds: task.status === 'cancelled'
					? previouslyEligiblePersonnelIds
					: [normalizedPersonnelId],
			})
			await emitToAuthorizedOfficers(
				'task:updated',
				serialized,
				task,
				remainingEligiblePersonnelIds,
			)
		}
		io.emit('dashboard:updated')
		return { cancelled, withdrawn }
	}

	return {
		acceptTask,
		cancelTask,
		completeTask,
		createTask,
		deactivatePersonnelTasks,
		expandTaskAudience,
		getTask,
		listTasks,
		loadTasks,
		reconcileTaskArrivals,
	}
}

module.exports = createTaskService
