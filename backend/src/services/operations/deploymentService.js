const { getAreaCoordinates, normalizeBarangayCode, point } = require('../../utils/geo')
const {
	buildPrefixSearchConditions,
	createPaginationMeta,
	parsePagination,
} = require('../../utils/query')
const {
	OPERATIONAL_LIMITS,
	createValidationError,
	validateDate,
	validateDeploymentId,
	validatePatrolArea,
	validateText,
} = require('../../utils/operationalValidation')
const {
	DEPLOYMENT_STATUSES,
	MANAGEABLE_DEPLOYMENT_STATUSES,
	activeShiftConditions,
	createNotFoundResult,
	deploymentNoticeSignature,
	deploymentSignature,
	isDeploymentCurrent,
	serializeDeployment,
} = require('./domain')
const { getOfficerPersonnelId } = require('./access')
const { appendFilterCondition } = require('./pagination')
const { emitDeploymentCollection } = require('./events')

const createDeploymentService = ({
	io,
	models,
	loadPersonnelMap,
	personnelService,
	notificationService,
	publish,
	clock = () => new Date(),
}) => {
	const { Deployment, Personnel } = models
	const { emitPersonnelCollection, getPersonnelWithLocations } = personnelService
	const { createNotification, deliverNotification } = notificationService
	const { emitToSupervisorAndPersonnel } = publish

	const loadDeployments = async (personnelId) => {
		const query = {
			status: 'active',
			...(personnelId ? {
				personnelId,
				$and: activeShiftConditions(clock()),
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

	const getUpcomingDeployment = async (personnelId, now = clock()) => {
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

	const reconcileDeploymentShifts = async ({ broadcast = true, now = clock() } = {}) => {
		const [activatingDeployments, completingDeployments] = await Promise.all([
			Deployment.find({
				status: 'scheduled',
				shiftStart: { $ne: null, $lte: now },
				shiftEnd: { $gt: now },
			}).lean(),
			Deployment.find({
				status: { $in: MANAGEABLE_DEPLOYMENT_STATUSES },
				shiftEnd: { $ne: null, $lte: now },
			}).lean(),
		])
		const affectedPersonnelIds = [
			...activatingDeployments.map((deployment) => deployment.personnelId),
			...completingDeployments.map((deployment) => deployment.personnelId),
		]
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
			emitDeploymentCollection({
				io,
				eventName: 'deployments:updated',
				deployments,
				affectedPersonnelIds,
			})
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

		return { affectedPersonnelIds, changed, onDutyPersonnelIds }
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
		deployment.acknowledgedAt = clock()
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

	const listDeployments = async (query = {}, actor) => {
		const pagination = parsePagination(query)
		const filter = {}
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (officerPersonnelId) filter.personnelId = officerPersonnelId
		else if (query.personnel_id) filter.personnelId = String(query.personnel_id)
		if (query.barangay) filter.barangayCode = normalizeBarangayCode(query.barangay)
		if (query.view === 'manageable') {
			filter.status = MANAGEABLE_DEPLOYMENT_STATUSES.includes(query.status)
				? query.status
				: { $in: MANAGEABLE_DEPLOYMENT_STATUSES }
		} else if (DEPLOYMENT_STATUSES.includes(query.status)) {
			filter.status = query.status
		} else {
			filter.status = 'active'
		}
		if (query.search) {
			buildPrefixSearchConditions(query.search, [
				'assignmentId',
				'groupId',
				'personnelId',
				'personnelName',
				'rank',
				'barangayCode',
				'patrolArea',
			]).forEach((condition) => appendFilterCondition(filter, condition))
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
		const reconciliation = await reconcileDeploymentShifts({ broadcast: false })
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
		emitDeploymentCollection({
			io,
			eventName: 'deployments:updated',
			deployments: activeDeployments,
			affectedPersonnelIds: [
				deployment.personnelId,
				...reconciliation.affectedPersonnelIds,
			],
		})
		emitPersonnelCollection(io, 'personnel:update', personnel)
		return {
			status: 200,
			body: {
				success: true,
				deployment: serialized,
			},
		}
	}

	const replaceDeployments = async (payload = []) => {
		const now = clock()
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

		const reconciliation = await reconcileDeploymentShifts({ broadcast: false })
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
		emitDeploymentCollection({
			io,
			eventName: 'deployments:updated',
			deployments: activeDeployments,
			affectedPersonnelIds: [
				...previousDeployments.map((deployment) => deployment.personnelId),
				...normalizedAssignments.map((assignment) => assignment.personnelId),
				...reconciliation.affectedPersonnelIds,
			],
		})
		emitPersonnelCollection(io, 'personnel:update', personnel)
		io.emit('dashboard:updated')
		return manageablePayload.data
	}

	return {
		acknowledgeDeployment,
		getDeployment,
		getUpcomingDeployment,
		listDeployments,
		loadDeployments,
		reconcileDeploymentShifts,
		replaceDeployments,
		updateDeploymentStatus,
	}
}

module.exports = createDeploymentService
