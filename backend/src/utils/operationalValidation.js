const { CABAGAN_BARANGAYS } = require('../constants/cabaganBarangays')

const OPERATIONAL_LIMITS = Object.freeze({
	reportTitle: 150,
	reportDescription: 5000,
	reportLocation: 200,
	resolutionNotes: 2000,
	taskTitle: 150,
	taskDescription: 1000,
	taskLocation: 200,
	deploymentId: 80,
	deploymentGroupId: 80,
	deploymentArea: 120,
	deploymentInstructions: 1000,
	deploymentBatch: 100,
	locationName: 200,
})

const REPORT_TYPES = Object.freeze(['incident', 'patrol', 'checkpoint', 'others'])
const DEPLOYMENT_ID_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/i
const EXTRA_PATROL_AREAS = [
	'Cabagan Public Market Zone',
	'Municipal Hall Perimeter',
	'Barangay Centro Route',
	'Cabagan-Santa Maria Road',
	'Cabagan-Tumauini Road',
	'Maharlika Highway Northbound',
	'Maharlika Highway Southbound',
	'National Highway Checkpoint North',
	'National Highway Checkpoint South',
	'Highway Checkpoint North',
	'Highway Checkpoint South',
	'School Safety Patrol Route',
	'Bridge Approach Patrol Zone',
]
const PATROL_AREAS = Object.freeze([
	...CABAGAN_BARANGAYS.map((barangay) => `Barangay ${barangay.name}`),
	...EXTRA_PATROL_AREAS,
])
const patrolAreaByName = new Map(
	PATROL_AREAS.map((area) => [area.toLocaleLowerCase('en-PH'), area]),
)

const createValidationError = (message, field, code = 'INVALID_OPERATIONAL_FIELD') => {
	const error = new Error(message)
	error.status = 400
	error.code = code
	if (field) error.field = field
	return error
}

const isInvalidScalar = (value) => (
	typeof value === 'boolean'
	|| typeof value === 'object' && value !== null
)

const normalizeText = (value) => String(value ?? '')
	.normalize('NFC')
	.replace(/\r\n?/g, '\n')
	.trim()

const validateText = (
	value,
	{
		field,
		label,
		maxLength,
		required = false,
		allowNewlines = true,
	} = {},
) => {
	if (isInvalidScalar(value)) {
		throw createValidationError(`${label} must be text.`, field)
	}
	const text = normalizeText(value)
	if (required && !text) throw createValidationError(`${label} is required.`, field)
	if (text.length > maxLength) {
		throw createValidationError(
			`${label} must not exceed ${maxLength} characters.`,
			field,
		)
	}
	const hasUnsupportedControlCharacter = [...text].some((character) => {
		const codePoint = character.codePointAt(0)
		if (codePoint === 0x7f) return true
		if (codePoint > 0x1f) return false
		return !allowNewlines || ![0x09, 0x0a].includes(codePoint)
	})
	if (hasUnsupportedControlCharacter) {
		throw createValidationError(`${label} contains unsupported characters.`, field)
	}
	return text
}

const validateReportType = (value) => {
	if (typeof value !== 'string') {
		throw createValidationError('Report type must be text.', 'report_type')
	}
	const reportType = String(value || '').trim().toLowerCase()
	if (!REPORT_TYPES.includes(reportType)) {
		throw createValidationError(
			`Report type must be one of: ${REPORT_TYPES.join(', ')}.`,
			'report_type',
		)
	}
	return reportType
}

const validatePatrolArea = (value) => {
	const area = validateText(value, {
		field: 'patrolArea',
		label: 'Patrol area',
		maxLength: OPERATIONAL_LIMITS.deploymentArea,
		required: true,
		allowNewlines: false,
	})
	const canonical = patrolAreaByName.get(area.toLocaleLowerCase('en-PH'))
	if (!canonical) {
		throw createValidationError(
			'Select a patrol area from the approved Cabagan deployment list.',
			'patrolArea',
		)
	}
	return canonical
}

const validateDeploymentId = (value, field = 'id') => {
	if (typeof value !== 'string') {
		throw createValidationError(
			`${field === 'groupId' ? 'Deployment group ID' : 'Assignment ID'} must be text.`,
			field,
		)
	}
	const id = String(value || '').trim()
	const maxLength = field === 'groupId'
		? OPERATIONAL_LIMITS.deploymentGroupId
		: OPERATIONAL_LIMITS.deploymentId
	if (!id || id.length > maxLength || !DEPLOYMENT_ID_PATTERN.test(id)) {
		throw createValidationError(
			`${field === 'groupId' ? 'Deployment group ID' : 'Assignment ID'} must contain letters, numbers, and single hyphens only.`,
			field,
		)
	}
	return id
}

const validateDate = (
	value,
	{
		field,
		label,
		required = true,
		min,
		max,
	} = {},
) => {
	if ((value === null || value === undefined || value === '') && !required) return undefined
	if (
		isInvalidScalar(value)
		&& !(value instanceof Date)
	) {
		throw createValidationError(`${label} must be a valid date and time.`, field)
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		throw createValidationError(`${label} must be a valid date and time.`, field)
	}
	if (min && date < min) {
		throw createValidationError(`${label} is earlier than the allowed date.`, field)
	}
	if (max && date > max) {
		throw createValidationError(`${label} cannot be in the future.`, field)
	}
	return date
}

const validateOptionalNumber = (
	value,
	{ field, label, min, max } = {},
) => {
	if (value === null || value === undefined || value === '') return undefined
	if (isInvalidScalar(value)) {
		throw createValidationError(`${label} must be between ${min} and ${max}.`, field)
	}
	const number = Number(value)
	if (!Number.isFinite(number) || number < min || number > max) {
		throw createValidationError(`${label} must be between ${min} and ${max}.`, field)
	}
	return number
}

module.exports = {
	OPERATIONAL_LIMITS,
	PATROL_AREAS,
	REPORT_TYPES,
	createValidationError,
	normalizeText,
	validateDate,
	validateDeploymentId,
	validateOptionalNumber,
	validatePatrolArea,
	validateReportType,
	validateText,
}
