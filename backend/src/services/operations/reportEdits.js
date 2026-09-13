const { findCabaganBarangay } = require('../../constants/cabaganBarangays')
const { isInsideCabagan } = require('../../utils/cabaganGeofence')
const { isValidCoordinates, point } = require('../../utils/geo')
const { OPERATIONAL_LIMITS, createValidationError, validateText, validateDate, validateOptionalNumber, validateReportType } = require('../../utils/operationalValidation')

const fields = ['title', 'description', 'report_type', 'barangay', 'location', 'location_source', 'latitude', 'longitude', 'severity', 'occurred_at', 'reason', 'revision']
const conflict = () => Object.assign(createValidationError('This report changed since you opened it. Reopen the report and review the latest version before saving.', 'revision', 'REPORT_CHANGED'), { status: 409 })
const assertRevision = (report, revision) => {
	if (!Number.isInteger(revision) || revision !== (report.__v || 0)) {
		throw conflict()
	}
}
const saveReport = async (report) => {
	try { await report.save() } catch (error) {
		if (error.name === 'VersionError') throw conflict()
		throw error
	}
}
const editValues = (report, payload, now) => {
	if (Object.keys(payload).some((key) => !fields.includes(key))) throw createValidationError('Only report content and the correction reason can be edited.', 'report')
	assertRevision(report, payload.revision)
	const reason = validateText(payload.reason, { field: 'reason', label: 'Reason for correction', required: true, maxLength: 500 })
	const reportType = validateReportType(payload.report_type ?? report.reportType)
	if (report.caseStatus === 'resolved' && reportType !== report.reportType) throw createValidationError('The type of a resolved incident cannot be changed.', 'report_type')
	const barangay = payload.barangay === undefined ? null : findCabaganBarangay(payload.barangay)
	if (payload.barangay !== undefined && !barangay) throw createValidationError('Select an official Cabagan barangay.', 'barangay')
	const values = {
		title: validateText(payload.title ?? report.title, { field: 'title', label: 'Report title', maxLength: OPERATIONAL_LIMITS.reportTitle, required: true, allowNewlines: false }),
		description: validateText(payload.description ?? report.description, { field: 'description', label: 'Report description', maxLength: OPERATIONAL_LIMITS.reportDescription, required: true }),
		locationName: validateText(payload.location ?? report.locationName, { field: 'location', label: 'Exact incident place', maxLength: OPERATIONAL_LIMITS.reportLocation, required: true, allowNewlines: false }),
		reportType, isIncident: reportType === 'incident',
		barangayCode: barangay?.code || report.barangayCode,
		severity: validateOptionalNumber(payload.severity ?? report.severity, { field: 'severity', label: 'Severity', min: 1, max: 5 }),
		incidentAt: payload.occurred_at === undefined ? report.incidentAt : validateDate(payload.occurred_at, { field: 'occurred_at', label: 'Incident/activity time', min: new Date(Math.min(now.getTime() - 365 * 86400000, new Date(report.incidentAt).getTime())), max: new Date(now.getTime() + 300000) }),
		locationSource: payload.location_source ?? report.locationSource,
		location: report.location,
	}
	if (!Number.isInteger(values.severity)) throw createValidationError('Severity must be a whole number from 1 to 5.', 'severity')
	if (!['manual', 'gps', 'backup_request'].includes(values.locationSource)) throw createValidationError('Location source must be gps, manual, or backup_request.', 'location_source')
	if ('latitude' in payload || 'longitude' in payload) {
		const empty = payload.latitude == null && payload.longitude == null
		if (!empty && !isValidCoordinates(payload.latitude, payload.longitude)) throw createValidationError('Provide a valid latitude and longitude.', 'location')
		if (!empty && !isInsideCabagan(payload.latitude, payload.longitude)) throw createValidationError('The incident point must be inside Cabagan.', 'location')
		values.location = empty ? undefined : point(payload.longitude, payload.latitude)
	}
	if (values.locationSource === 'gps' && !values.location) throw createValidationError('GPS coordinates are required.', 'location')
	if (report.isIncident !== values.isIncident) values.caseStatus = values.isIncident ? 'open' : 'not_applicable'
	const jsonValue = (value) => value == null ? null : JSON.parse(JSON.stringify(value))
	const changes = Object.entries(values).filter(([key, value]) => JSON.stringify(jsonValue(report[key])) !== JSON.stringify(jsonValue(value)))
		.map(([field, value]) => ({ field, before: jsonValue(report[field]), after: jsonValue(value) }))
	if (!changes.length) throw createValidationError('Change at least one report field before saving.', 'report')
	return { values, changes, reason }
}
module.exports = { editValues, assertRevision, saveReport }
