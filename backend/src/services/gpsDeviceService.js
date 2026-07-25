const { GpsDeviceAssignment } = require('../models')
const { createPaginationMeta, parsePagination } = require('../utils/query')

const serializeAssignment = (assignment) => ({
	id: assignment.assignmentId,
	personnel_id: assignment.personnelId,
	flespi_device_id: assignment.flespiDeviceId,
	imei: assignment.imei,
	device_name: assignment.deviceName,
	assigned_by: assignment.assignedBy,
	assigned_at: assignment.assignedAt?.toISOString(),
	unassigned_at: assignment.unassignedAt?.toISOString(),
	status: assignment.status,
})

const listAssignments = async (query = {}) => {
	const pagination = parsePagination(query)
	const filter = {}
	if (['active', 'released'].includes(query.status)) filter.status = query.status
	if (query.personnel_id) filter.personnelId = String(query.personnel_id)
	const [documents, total] = await Promise.all([
		GpsDeviceAssignment.find(filter)
			.sort({ assignedAt: -1, _id: -1 })
			.skip(pagination.skip)
			.limit(pagination.limit)
			.lean(),
		GpsDeviceAssignment.countDocuments(filter),
	])
	return {
		data: documents.map(serializeAssignment),
		pagination: createPaginationMeta({ ...pagination, total }),
	}
}

module.exports = { listAssignments }
