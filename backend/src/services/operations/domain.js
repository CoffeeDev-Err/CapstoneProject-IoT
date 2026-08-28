const { createHash } = require('crypto')
const { barangayNameFromCode, readCoordinates } = require('../../utils/geo')
const { isCabaganBarangayCode } = require('../../constants/cabaganBarangays')
const { toMediaAccessPath } = require('../mediaStorageService')

const MANAGEABLE_DEPLOYMENT_STATUSES = Object.freeze(['scheduled', 'active'])
const DEPLOYMENT_STATUSES = Object.freeze([
	...MANAGEABLE_DEPLOYMENT_STATUSES,
	'completed',
	'cancelled',
])

const asDate = (value, fallback = new Date()) => {
	const date = value ? new Date(value) : fallback
	return Number.isNaN(date.getTime()) ? fallback : date
}

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
	...(report.submittedFrom && { submitted_from: readCoordinates(report.submittedFrom) }),
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
		deployment.acknowledgedAt && deployment.acknowledgedSignature === signature,
	)
	return {
		id: deployment.assignmentId,
		groupId: deployment.groupId,
		personnelId: deployment.personnelId,
		personnelName: personnelById.get(deployment.personnelId)?.fullName || deployment.personnelName,
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

module.exports = {
	DEPLOYMENT_STATUSES,
	MANAGEABLE_DEPLOYMENT_STATUSES,
	activeShiftConditions,
	asDate,
	createNotFoundResult,
	deploymentNoticeSignature,
	deploymentSignature,
	isDeploymentCurrent,
	serializeDeployment,
	serializeReport,
	serializeTask,
}
