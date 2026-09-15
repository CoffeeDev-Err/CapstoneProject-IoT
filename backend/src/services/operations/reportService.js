const { randomUUID } = require('crypto')
const {
	distanceInMeters,
	isValidCoordinates,
	normalizeBarangayCode,
	point,
} = require('../../utils/geo')
const { findCabaganBarangay } = require('../../constants/cabaganBarangays')
const {
	buildDateRange,
	buildPrefixSearchConditions,
	createPaginationMeta,
	parsePagination,
} = require('../../utils/query')
const { isInsideCabagan } = require('../../utils/cabaganGeofence')
const { getLocationStaleThresholdMs } = require('../../utils/locationFreshness')
const {
	OPERATIONAL_LIMITS,
	createValidationError,
	validateDate,
	validateOptionalNumber,
	validateReportType,
	validateText,
} = require('../../utils/operationalValidation')
const {
	activeShiftConditions,
	createNotFoundResult,
	serializeReport,
	serializeTask,
} = require('./domain')
const { getOfficerPersonnelId, taskParticipantIds } = require('./access')
const { appendFilterCondition, findCursorPage } = require('./pagination')
const { editValues, assertRevision, saveReport } = require('./reportEdits')

const REPORT_GPS_MAX_DISTANCE_METERS = 100
const CLIENT_SUBMISSION_ID_PATTERN = /^mobile-[a-z0-9-]{10,100}$/i
const alreadyResolvedResult = () => ({
	status: 409,
	body: {
		success: false,
		code: 'REPORT_ALREADY_RESOLVED',
		message: 'This incident has already been resolved. Open the report to view the recorded resolution.',
	},
})

const createReportService = ({
	io,
	models,
	loadPersonnelMap,
	personnelService,
	notificationService,
	auditService = { recordAudit: async () => null },
	reportRouteService,
	publish,
	clock = () => new Date(),
	idGenerator = randomUUID,
}) => {
	const { CurrentLocation, Deployment, Report, Task } = models
	const { getPersonnelMember } = personnelService
	const { deliverNotification } = notificationService
	const { recordAudit } = auditService
	const emitToSupervisorAndPersonnel = publish.emitToSupervisorAndPersonnel

	const loadReports = async (personnelId) => {
		const query = personnelId ? { submittedBy: personnelId } : {}
		const reports = await Report.find(query).sort({ submittedAt: -1, _id: -1 }).lean()
		const personnelById = await loadPersonnelMap(reports.map((report) => report.submittedBy))
		return reports.map((report) => serializeReport(report, personnelById))
	}

	const listReports = async (query = {}, actor) => {
		const pagination = parsePagination(query)
		const filter = {}
		const reportSortFields = {
			submitted_at: 'submittedAt',
			report_type: 'reportType',
			severity: 'severity',
			validation_status: 'validationStatus',
			case_status: 'caseStatus',
		}
		const sortField = reportSortFields[query.sort_by] || 'submittedAt'
		const sortDirection = String(query.sort_order).toLowerCase() === 'asc' ? 1 : -1
		const sort = { [sortField]: sortDirection, _id: sortDirection }
		const officerPersonnelId = getOfficerPersonnelId(actor)
		if (officerPersonnelId) filter.submittedBy = officerPersonnelId
		else if (query.personnel_id) filter.submittedBy = String(query.personnel_id)
		if (query.report_type) filter.reportType = String(query.report_type).toLowerCase()
		if (query.category === 'incident') filter.isIncident = true
		if (query.category === 'routine') filter.isIncident = false
		if (query.barangay) filter.barangayCode = normalizeBarangayCode(query.barangay)
		if (['open', 'resolved', 'not_applicable'].includes(query.case_status)) filter.caseStatus = query.case_status
		if (['pending', 'validated', 'rejected'].includes(query.validation_status)) filter.validationStatus = query.validation_status
		const dateRange = buildDateRange(query.from, query.to)
		if (dateRange) filter.submittedAt = dateRange
		if (query.search) {
			buildPrefixSearchConditions(query.search, [
				'reportNumber', 'submittedBy', 'officerName', 'title',
				'assignedArea', 'barangayCode', 'locationName',
			]).forEach((condition) => appendFilterCondition(filter, condition))
		}

		if (query.pagination === 'cursor') {
			const cursorPage = await findCursorPage({
				model: Report,
				filter,
				dateField: 'submittedAt',
				limit: Math.min(pagination.limit, 50),
				cursor: query.cursor,
			})
			const personnelById = await loadPersonnelMap(cursorPage.data.map((report) => report.submittedBy))
			return {
				data: cursorPage.data.map((report) => serializeReport(report, personnelById)),
				pagination: cursorPage.pagination,
			}
		}

		const [documents, total] = await Promise.all([
			Report.find(filter).sort(sort).skip(pagination.skip).limit(pagination.limit).lean(),
			Report.countDocuments(filter),
		])
		const personnelById = await loadPersonnelMap(documents.map((report) => report.submittedBy))
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

	const getReportByClientSubmissionId = async (personnelId, rawSubmissionId) => {
		const clientSubmissionId = String(rawSubmissionId || '').trim()
		if (!clientSubmissionId) return null
		if (!CLIENT_SUBMISSION_ID_PATTERN.test(clientSubmissionId)) {
			const error = new Error('The report submission identifier is invalid.')
			error.status = 400
			throw error
		}
		const report = await Report.findOne({ submittedBy: personnelId, clientSubmissionId })
		if (!report) return null
		const personnelById = await loadPersonnelMap([report.submittedBy])
		return serializeReport(report, personnelById)
	}

	const updateReportValidation = async (reportId, payload = {}, actor = {}) => {
		const validationStatus = String(payload.validation_status || '').toLowerCase()
		if (!['pending', 'validated', 'rejected'].includes(validationStatus)) {
			return {
				status: 400,
				body: { success: false, message: 'validation_status must be pending, validated, or rejected.' },
			}
		}
		const report = await Report.findOne({ reportNumber: reportId })
		if (!report) return createNotFoundResult('Report')
		if (payload.revision !== undefined) assertRevision(report, payload.revision)
		const previousStatus = report.validationStatus
		report.validationStatus = validationStatus
		report.reviewedAt = clock()
		report.reviewedBy = actor.fullName || actor.username || 'Supervisor'
		report.history ||= []
		report.history.push({ at: clock(), by: String(actor.id || actor._id || 'supervisor'), name: report.reviewedBy,
			kind: 'review', reason: 'Supervisor review', changes: [{ field: 'validationStatus', before: previousStatus, after: validationStatus }] })
		await saveReport(report)
		await recordAudit({
			actor,
			action: 'report.reviewed',
			entityType: 'report',
			entityId: report.reportNumber,
			changes: {
				validationStatus: { from: previousStatus, to: validationStatus },
				revision: report.__v || 0,
			},
		})
		const personnelById = await loadPersonnelMap([report.submittedBy])
		const serialized = serializeReport(report, personnelById)
		const notificationType = validationStatus === 'validated'
			? 'success'
			: validationStatus === 'rejected' ? 'warning' : 'info'
		const notification = {
			type: notificationType,
			title: 'Report Review Updated',
			message: `${report.reportNumber} was marked ${validationStatus} by the COP.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
		}
		await deliverNotification({
			io,
			recipientId: report.submittedBy,
			...notification,
			priority: validationStatus === 'rejected' ? 'high' : 'normal',
			data: { destination: 'Reports', reportId: report.reportNumber },
			dedupeKey: `report:${report.reportNumber}:validation:${validationStatus}:${report.__v || 0}`,
		})
		emitToSupervisorAndPersonnel('report:updated', serialized, report.submittedBy)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, report: serialized } }
	}

	const editReport = async (reportId, payload, actor) => {
		const personnelId = getOfficerPersonnelId(actor)
		if (!personnelId) return { status: 403, body: { success: false, message: 'Only the submitting officer can correct a report.' } }
		const report = await Report.findOne({ reportNumber: reportId, submittedBy: personnelId })
		if (!report) return createNotFoundResult('Report')
		if (report.backupResponse?.taskId
			&& payload.report_type !== undefined
			&& String(payload.report_type).trim().toLowerCase() !== 'incident') {
			throw createValidationError(
				'A report linked to a backup response must remain an incident report.',
				'report_type', 'BACKUP_REPORT_MUST_BE_INCIDENT',
			)
		}
		const { evidence_correction: evidenceCorrection, ...contentPayload } = payload
		const editTime = clock()
		const { values, changes, reason } = editValues(
			report,
			contentPayload,
			editTime,
			{ allowUnchanged: Boolean(evidenceCorrection) },
		)
		let correctionEntry
		if (evidenceCorrection) {
			const evidencePath = String(evidenceCorrection.path || '').trim()
			if (!evidencePath) throw createValidationError('The corrected evidence upload is unavailable.', 'evidence_photo')
			if (!['image/jpeg', 'image/png', 'image/webp'].includes(evidenceCorrection.mimeType)) {
				throw createValidationError('Corrected photo evidence must be a JPEG, PNG, or WebP image.', 'evidence_photo')
			}
			const evidenceSize = Number(evidenceCorrection.size)
			if (!Number.isFinite(evidenceSize) || evidenceSize < 1 || evidenceSize > 5 * 1024 * 1024) {
				throw createValidationError('Corrected photo evidence must be 5 MB or smaller.', 'evidence_photo')
			}
			const capturedAt = validateDate(evidenceCorrection.capturedAt || editTime, {
				field: 'evidence_captured_at', label: 'Evidence capture time',
				min: new Date(editTime.getTime() - 365 * 86400000),
				max: new Date(editTime.getTime() + 300000),
			})
			correctionEntry = {
				evidence: {
					...evidenceCorrection,
					path: evidencePath,
					cameraFacing: evidenceCorrection.cameraFacing === 'front' ? 'front' : 'back',
					capturedAt,
				},
				addedAt: editTime,
				addedBy: personnelId,
				addedByName: actor.fullName || report.officerName,
				reason,
				revision: (report.__v || 0) + 1,
			}
		}
		const oldCoordinates = report.location?.coordinates
		const newCoordinates = values.location?.coordinates
		if (values.locationSource === 'gps' && (report.locationSource !== 'gps' || JSON.stringify(oldCoordinates) !== JSON.stringify(newCoordinates))) {
			const current = await CurrentLocation.findOne({ personnelId }).lean()
			const age = clock().getTime() - new Date(current?.recordedAt || 0).getTime()
			if (!current?.location?.coordinates || !Number.isFinite(age) || age < -300000 || age > getLocationStaleThresholdMs()
				|| distanceInMeters(current.location.coordinates, newCoordinates) > REPORT_GPS_MAX_DISTANCE_METERS) {
				throw createValidationError('The current GPS reading is unavailable or changed. Pick the actual incident point manually.', 'location')
			}
		}
		const previousStatus = report.validationStatus
		const isValidatedCorrection = previousStatus === 'validated'
		report.history ||= []
		report.history.push({ at: editTime, by: personnelId, name: actor.fullName || report.officerName,
			kind: previousStatus === 'validated' ? 'correction' : 'edit', reason,
			changes: [
				...changes,
				...(correctionEntry ? [{
					field: 'evidenceCorrection',
					before: null,
					after: {
						capturedAt: correctionEntry.evidence.capturedAt,
						cameraFacing: correctionEntry.evidence.cameraFacing,
						size: correctionEntry.evidence.size,
					},
				}] : []),
				{ field: 'validationStatus', before: previousStatus, after: 'pending' },
			],
		})
		Object.assign(report, values, { validationStatus: 'pending', reviewedAt: undefined, reviewedBy: undefined })
		if (correctionEntry) {
			report.evidenceCorrections ||= []
			report.evidenceCorrections.push(correctionEntry)
		}
		// The original route/evidence and submission metadata remain part of the record.
		await saveReport(report)
		await recordAudit({
			actor,
			action: isValidatedCorrection ? 'report.correction_submitted' : 'report.updated',
			entityType: 'report',
			entityId: report.reportNumber,
			changes: {
				changedFields: report.history.at(-1).changes.map((change) => change.field),
				revision: report.__v || 0,
			},
		})
		const serialized = serializeReport(report, await loadPersonnelMap([personnelId]))
		emitToSupervisorAndPersonnel('report:updated', serialized, personnelId)
		io.emit('dashboard:updated')
		// A notification delivery failure must not turn a saved correction into a failed write.
		await deliverNotification({
			io,
			recipientId: 'supervisor',
			type: 'info',
			title: isValidatedCorrection ? 'Report correction submitted' : 'Report updated',
			message: `${report.reportNumber} was ${isValidatedCorrection ? 'corrected' : 'updated'} and needs review.`,
			referenceType: 'report',
			referenceId: report.reportNumber,
			priority: 'high',
			data: { destination: 'Reports', reportId: report.reportNumber },
			dedupeKey: `report:${report.reportNumber}:${isValidatedCorrection ? 'correction' : 'edit'}:${serialized.revision}`,
		}).catch(() => {})
		return { status: 200, body: { success: true, report: serialized } }
	}

	const submitReport = async (payload = {}, actor = {}) => {
		const officer = payload.personnel_id ? await getPersonnelMember(payload.personnel_id) : null
		if (!officer) {
			const error = new Error('An active, GPS-linked personnel account is required to submit a report.')
			error.status = 400
			throw error
		}
		const now = clock()
		const clientSubmissionId = String(payload.client_submission_id || '').trim()
		if (clientSubmissionId && !CLIENT_SUBMISSION_ID_PATTERN.test(clientSubmissionId)) {
			const error = new Error('The report submission identifier is invalid.')
			error.status = 400
			throw error
		}
		const reportType = validateReportType(payload.report_type)
		const isIncident = reportType === 'incident'
		const backupTaskId = String(payload.backup_task_id || '').trim()
		let backupTask = null
		let backupPersonnelById = new Map()
		if (backupTaskId) {
			backupTask = await Task.findOne({ taskId: backupTaskId })
			if (!backupTask || backupTask.type !== 'backup') {
				throw createValidationError('The linked backup request could not be found.', 'backup_task_id', 'BACKUP_REQUEST_NOT_FOUND')
			}
			if (backupTask.requestedBy !== officer.id) {
				const error = createValidationError('Only the officer who requested backup can submit its incident report.', 'backup_task_id', 'BACKUP_REPORT_NOT_ALLOWED')
				error.status = 403
				throw error
			}
			if (backupTask.status !== 'completed' || !backupTask.completedAt) {
				throw createValidationError('Complete the backup response before creating its incident report.', 'backup_task_id', 'BACKUP_RESPONSE_ACTIVE')
			}
			if (!isIncident) {
				throw createValidationError('A backup response must be submitted as an incident report.', 'report_type', 'BACKUP_REPORT_MUST_BE_INCIDENT')
			}
			const existingBackupReport = await Report.findOne({ 'backupResponse.taskId': backupTaskId }).lean()
			if (existingBackupReport) {
				const error = createValidationError(`Backup request ${backupTaskId} is already linked to ${existingBackupReport.reportNumber}.`, 'backup_task_id', 'BACKUP_REPORT_EXISTS')
				error.status = 409
				throw error
			}
			backupPersonnelById = await loadPersonnelMap(
				(backupTask.responders || []).map((responder) => responder.personnelId),
			)
		}
		const selectedBarangay = findCabaganBarangay(payload.barangay)
		if (!selectedBarangay) {
			const error = new Error('Select one of the 26 official Cabagan barangays before submitting.')
			error.status = 400
			throw error
		}

		const title = validateText(payload.title, {
			field: 'title', label: 'Report title', maxLength: OPERATIONAL_LIMITS.reportTitle,
			required: true, allowNewlines: false,
		})
		const description = validateText(payload.description, {
			field: 'description', label: 'Report description',
			maxLength: OPERATIONAL_LIMITS.reportDescription, required: true,
		})
		const locationName = validateText(
			String(payload.location_source || '').trim().toLowerCase() === 'backup_request' && backupTask
				? backupTask.locationName
				: payload.location,
			{
			field: 'location', label: 'Exact incident location',
			maxLength: OPERATIONAL_LIMITS.reportLocation, required: true, allowNewlines: false,
			},
		)
		const locationSource = String(payload.location_source || '').trim().toLowerCase()
		if (!['gps', 'manual', 'backup_request'].includes(locationSource)) {
			throw createValidationError('Location source must be gps, manual, or backup_request.', 'location_source')
		}
		if (locationSource === 'backup_request' && !backupTask) {
			throw createValidationError('A linked backup request is required for this location source.', 'location_source', 'BACKUP_REQUEST_REQUIRED')
		}
		const occurredAt = validateDate(payload.occurred_at || now, {
			field: 'occurred_at', label: 'Incident date and time',
			min: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
			max: new Date(now.getTime() + 5 * 60 * 1000),
		})
		const severity = validateOptionalNumber(payload.severity ?? (isIncident ? 2 : 1), {
			field: 'severity', label: 'Severity', min: 1, max: 5,
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

		const backupCoordinates = backupTask?.location?.coordinates
		const usesBackupLocation = locationSource === 'backup_request'
		const sourceLatitude = usesBackupLocation ? backupCoordinates?.[1] : payload.latitude
		const sourceLongitude = usesBackupLocation ? backupCoordinates?.[0] : payload.longitude
		const hasLatitude = sourceLatitude !== null && sourceLatitude !== undefined && sourceLatitude !== ''
		const hasLongitude = sourceLongitude !== null && sourceLongitude !== undefined && sourceLongitude !== ''
		const suppliedLatitude = hasLatitude ? Number(sourceLatitude) : undefined
		const suppliedLongitude = hasLongitude ? Number(sourceLongitude) : undefined
		const hasValidSuppliedCoordinates = hasLatitude && hasLongitude
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
				'location_source', 'CURRENT_LOCATION_UNAVAILABLE',
			)
		}
		if (locationSource === 'gps' && !hasValidSuppliedCoordinates) {
			throw createValidationError(
				'Include the current device coordinates when using the GPS location source.',
				'location', 'REPORT_GPS_COORDINATES_REQUIRED',
			)
		}
		if (locationSource === 'backup_request' && !hasValidSuppliedCoordinates) {
			throw createValidationError(
				'The linked backup request does not contain valid GPS coordinates. Select the incident point manually.',
				'location', 'BACKUP_LOCATION_UNAVAILABLE',
			)
		}
		if (locationSource === 'gps'
			&& distanceInMeters(currentCoordinates, [suppliedLongitude, suppliedLatitude])
				> REPORT_GPS_MAX_DISTANCE_METERS) {
			throw createValidationError(
				`The submitted coordinates are more than ${REPORT_GPS_MAX_DISTANCE_METERS} meters from the latest server-verified GPS reading.`,
				'location', 'REPORT_GPS_LOCATION_MISMATCH',
			)
		}
		const latitude = suppliedLatitude
		const longitude = suppliedLongitude
		const hasReportCoordinates = isValidCoordinates(latitude, longitude)
		if (hasReportCoordinates && !isInsideCabagan(latitude, longitude)) {
			throw createValidationError(
				'The selected incident coordinates must be inside Cabagan.',
				'location', 'OUTSIDE_CABAGAN_REPORT_LOCATION',
			)
		}
		let evidencePhoto = payload.evidence_photo
		if (evidencePhoto) {
			evidencePhoto = {
				...evidencePhoto,
				capturedAt: validateDate(evidencePhoto.capturedAt || now, {
					field: 'evidence_captured_at', label: 'Evidence capture time',
					max: new Date(now.getTime() + 5 * 60 * 1000),
				}),
			}
		}
		const backupResponse = backupTask ? {
			taskId: backupTask.taskId,
			requestedAt: backupTask.createdAt,
			completedAt: backupTask.completedAt,
			requestLocation: backupTask.locationName,
			responders: (backupTask.responders || []).map((responder) => {
				const profile = backupPersonnelById.get(responder.personnelId)
				return {
					personnelId: responder.personnelId,
					name: profile?.fullName || responder.personnelId,
					rank: profile?.rank || '',
					badgeNumber: profile?.badgeNumber || '',
					acceptedAt: responder.acceptedAt,
					arrivedAt: responder.arrivedAt,
					arrivalDistanceMeters: responder.arrivalDistanceMeters,
					arrivalLocation: responder.arrivalLocation,
				}
			}),
		} : undefined
		let report
		try {
			report = await Report.create({
				reportNumber: `RPT-${now.getFullYear()}-${idGenerator().slice(0, 8).toUpperCase()}`,
				...(clientSubmissionId && { clientSubmissionId }),
				submittedBy: officer.id,
				officerName: officer.name,
				submittedAt: now,
				incidentAt: occurredAt,
				assignedArea: backupTask?.assignedArea || activeDeployment?.patrolArea || 'Unassigned area',
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
				...(hasReportCoordinates && { location: point(longitude, latitude) }),
				...(hasFreshCurrentLocation && {
					submittedFrom: point(currentCoordinates[0], currentCoordinates[1]),
				}),
				...(evidencePhoto && { evidencePhoto }),
				...(backupResponse && { backupResponse }),
			})
		} catch (error) {
			if (backupTaskId && error?.code === 11000
				&& (error.keyPattern?.['backupResponse.taskId'] || error.keyValue?.['backupResponse.taskId'])) {
				const existingBackupReport = await Report.findOne({ 'backupResponse.taskId': backupTaskId }).lean()
				const conflict = createValidationError(
					`Backup request ${backupTaskId} is already linked to ${existingBackupReport?.reportNumber || 'another report'}.`,
					'backup_task_id', 'BACKUP_REPORT_EXISTS',
				)
				conflict.status = 409
				throw conflict
			}
			throw error
		}
		try {
			if (backupTask) {
				backupTask.reportNumber = report.reportNumber
				await backupTask.save()
				const serializedTask = serializeTask(backupTask, backupPersonnelById)
				io.to('role:supervisor').emit('task:updated', serializedTask)
				taskParticipantIds(backupTask).forEach((personnelId) => {
					io.to(`personnel:${personnelId}`).emit('task:updated', serializedTask)
				})
			}
			await reportRouteService.captureSnapshot(report)
			const personnelById = await loadPersonnelMap([report.submittedBy])
			const serialized = serializeReport(report, personnelById)
			await deliverNotification({
				io,
				recipientId: 'supervisor',
				type: 'info',
				title: 'New Police Report',
				message: `${report.officerName} submitted ${report.reportNumber}.`,
				referenceType: 'report',
				referenceId: report.reportNumber,
				data: { destination: 'Reports', reportId: report.reportNumber },
				dedupeKey: `report:${report.reportNumber}:submitted`,
			})
			emitToSupervisorAndPersonnel('report:submitted', serialized, report.submittedBy)
			io.emit('dashboard:updated')
			await recordAudit({
				actor: Object.keys(actor).length > 0
					? actor
					: { role: 'officer', personnelId: report.submittedBy },
				action: 'report.submitted',
				entityType: 'report',
				entityId: report.reportNumber,
				changes: {
					reportType: report.reportType,
					severity: report.severity,
					barangayCode: report.barangayCode,
					isIncident: report.isIncident,
					...(report.backupResponse?.taskId && { backupTaskId: report.backupResponse.taskId }),
				},
			})
			return serialized
		} catch (error) {
			if (backupTask?.reportNumber === report.reportNumber) {
				backupTask.reportNumber = undefined
				await backupTask.save().catch(() => {})
			}
			await Report.deleteOne({ _id: report._id }).catch(() => {})
			throw error
		}
	}

	const resolveReport = async (reportId, payload = {}, actor = {}) => {
		const report = await Report.findOne({ reportNumber: reportId })
		if (!report) return { status: 404, body: { success: false, message: 'Report not found.' } }
		if (!report.isIncident) {
			return { status: 409, body: { success: false, message: 'Only incident reports can be resolved.' } }
		}
		if (payload.resolved_by && report.submittedBy !== String(payload.resolved_by)) {
			return {
				status: 403,
				body: { success: false, message: 'Only the officer who submitted this incident can resolve it.' },
			}
		}
		if (report.caseStatus === 'resolved') return alreadyResolvedResult()
		const resolution = {
			resolvedAt: clock(),
			resolvedBy: payload.resolved_by || report.submittedBy,
			notes: validateText(payload.resolution_notes, {
				field: 'resolution_notes', label: 'Resolution notes',
				maxLength: OPERATIONAL_LIMITS.resolutionNotes,
			}),
		}
		const resolvedReport = await Report.findOneAndUpdate(
			{
				reportNumber: reportId,
				submittedBy: report.submittedBy,
				isIncident: true,
				caseStatus: 'open',
			},
			{
				$set: { caseStatus: 'resolved', resolution },
				$inc: { __v: 1 },
			},
			{ new: true, runValidators: true },
		)
		if (!resolvedReport) {
			const latestReport = await Report.findOne({ reportNumber: reportId })
			if (!latestReport) return { status: 404, body: { success: false, message: 'Report not found.' } }
			if (latestReport.caseStatus === 'resolved') return alreadyResolvedResult()
			return {
				status: 409,
				body: {
					success: false,
					code: 'REPORT_STATE_CHANGED',
					message: 'This incident changed while it was being resolved. Reopen the report and review its latest status.',
				},
			}
		}
		const serialized = serializeReport(resolvedReport)
		await recordAudit({
			actor: Object.keys(actor).length > 0
				? actor
				: { role: 'officer', personnelId: resolvedReport.submittedBy },
			action: 'report.resolved',
			entityType: 'report',
			entityId: resolvedReport.reportNumber,
			changes: {
				caseStatus: { from: 'open', to: 'resolved' },
				revision: serialized.revision,
			},
		})
		await deliverNotification({
			io,
			recipientId: 'supervisor',
			type: 'success', title: 'Case Resolved',
			message: `${resolvedReport.reportNumber} was marked resolved from the mobile app.`,
			referenceType: 'report', referenceId: resolvedReport.reportNumber,
			data: { destination: 'Reports', reportId: resolvedReport.reportNumber },
			dedupeKey: `report:${resolvedReport.reportNumber}:resolved:${serialized.revision}`,
		})
		emitToSupervisorAndPersonnel('report:resolved', serialized, resolvedReport.submittedBy)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, report: serialized } }
	}

	return {
		getReport,
		editReport,
		getReportByClientSubmissionId,
		listReports,
		loadReports,
		resolveReport,
		submitReport,
		updateReportValidation,
	}
}

module.exports = createReportService
module.exports.CLIENT_SUBMISSION_ID_PATTERN = CLIENT_SUBMISSION_ID_PATTERN
module.exports.REPORT_GPS_MAX_DISTANCE_METERS = REPORT_GPS_MAX_DISTANCE_METERS
