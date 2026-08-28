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
} = require('./domain')
const { getOfficerPersonnelId } = require('./access')
const { appendFilterCondition, findCursorPage } = require('./pagination')

const REPORT_GPS_MAX_DISTANCE_METERS = 100
const CLIENT_SUBMISSION_ID_PATTERN = /^mobile-[a-z0-9-]{10,100}$/i

const createReportService = ({
	io,
	models,
	loadPersonnelMap,
	personnelService,
	notificationService,
	reportRouteService,
	publish,
	clock = () => new Date(),
	idGenerator = randomUUID,
}) => {
	const { CurrentLocation, Deployment, Report } = models
	const { getPersonnelMember } = personnelService
	const { createNotification, deliverNotification } = notificationService
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

	const updateReportValidation = async (reportId, payload = {}) => {
		const validationStatus = String(payload.validation_status || '').toLowerCase()
		if (!['pending', 'validated', 'rejected'].includes(validationStatus)) {
			return {
				status: 400,
				body: { success: false, message: 'validation_status must be pending, validated, or rejected.' },
			}
		}
		const report = await Report.findOne({ reportNumber: reportId })
		if (!report) return createNotFoundResult('Report')
		report.validationStatus = validationStatus
		await report.save()
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
		await createNotification(notification)
		await deliverNotification({
			io,
			recipientId: report.submittedBy,
			...notification,
			priority: validationStatus === 'rejected' ? 'high' : 'normal',
			data: { destination: 'Reports', reportId: report.reportNumber },
			dedupeKey: `report:${report.reportNumber}:validation:${validationStatus}`,
		})
		emitToSupervisorAndPersonnel('report:updated', serialized, report.submittedBy)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, report: serialized } }
	}

	const submitReport = async (payload = {}) => {
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
		const locationName = validateText(payload.location, {
			field: 'location', label: 'Exact incident location',
			maxLength: OPERATIONAL_LIMITS.reportLocation, required: true, allowNewlines: false,
		})
		const locationSource = String(payload.location_source || '').trim().toLowerCase()
		if (!['gps', 'manual'].includes(locationSource)) {
			throw createValidationError('Location source must be gps or manual.', 'location_source')
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

		const hasLatitude = payload.latitude !== null && payload.latitude !== undefined && payload.latitude !== ''
		const hasLongitude = payload.longitude !== null && payload.longitude !== undefined && payload.longitude !== ''
		const suppliedLatitude = hasLatitude ? Number(payload.latitude) : undefined
		const suppliedLongitude = hasLongitude ? Number(payload.longitude) : undefined
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
		if (locationSource === 'gps'
			&& distanceInMeters(currentCoordinates, [suppliedLongitude, suppliedLatitude])
				> REPORT_GPS_MAX_DISTANCE_METERS) {
			throw createValidationError(
				`The submitted coordinates are more than ${REPORT_GPS_MAX_DISTANCE_METERS} meters from the latest server-verified GPS reading.`,
				'location', 'REPORT_GPS_LOCATION_MISMATCH',
			)
		}
		const latitude = locationSource === 'gps' ? Number(currentCoordinates[1]) : suppliedLatitude
		const longitude = locationSource === 'gps' ? Number(currentCoordinates[0]) : suppliedLongitude
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
		const report = await Report.create({
			reportNumber: `RPT-${now.getFullYear()}-${idGenerator().slice(0, 8).toUpperCase()}`,
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
			...(hasReportCoordinates && { location: point(longitude, latitude) }),
			...(hasFreshCurrentLocation && {
				submittedFrom: point(currentCoordinates[0], currentCoordinates[1]),
			}),
			...(evidencePhoto && { evidencePhoto }),
		})
		try {
			await reportRouteService.captureSnapshot(report)
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
		report.caseStatus = 'resolved'
		report.resolution = {
			resolvedAt: clock(),
			resolvedBy: payload.resolved_by || report.submittedBy,
			notes: validateText(payload.resolution_notes, {
				field: 'resolution_notes', label: 'Resolution notes',
				maxLength: OPERATIONAL_LIMITS.resolutionNotes,
			}),
		}
		await report.save()
		const serialized = serializeReport(report)
		await createNotification({
			type: 'success', title: 'Case Resolved',
			message: `${report.reportNumber} was marked resolved from the mobile app.`,
			referenceType: 'report', referenceId: report.reportNumber,
		})
		emitToSupervisorAndPersonnel('report:resolved', serialized, report.submittedBy)
		io.emit('dashboard:updated')
		return { status: 200, body: { success: true, report: serialized } }
	}

	return {
		getReport,
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
