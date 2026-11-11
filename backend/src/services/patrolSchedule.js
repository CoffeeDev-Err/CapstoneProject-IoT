const { findCabaganBarangay } = require('../constants/cabaganBarangays')
const barangayCenters = require('../../../contracts/cabagan-patrol-centers.json')
const { isInsideCabagan } = require('../utils/cabaganGeofence')
const { createValidationError } = require('../utils/operationalValidation')

const normalizePatrolSchedule = (assignment) => {
	const blocks = assignment.scheduleBlocks
	const transitionGraceMinutes = assignment.transitionGraceMinutes ?? 10
	if (!Number.isInteger(transitionGraceMinutes) || transitionGraceMinutes < 0 || transitionGraceMinutes > 60) throw createValidationError('Travel allowance must be 0 to 60 minutes.', 'transitionGraceMinutes')
	if (!Array.isArray(blocks) || !blocks.length || blocks.length > 48) throw createValidationError('Add a patrol schedule with 1 to 48 blocks.', 'scheduleBlocks')
	if (!['area', 'route'].includes(assignment.deploymentType)) throw createValidationError('Choose Area or Route Patrol.', 'deploymentType')
	const mode = assignment.deploymentType === 'route' ? assignment.patrolMode : ''
	if (assignment.deploymentType === 'route' && !['walk', 'car', 'motorcycle'].includes(mode)) throw createValidationError('Choose Foot, Motorcycle or Car Patrol.', 'patrolMode')
	let offsetMinutes = 0
	const codes = new Set()
	const point = (value) => {
		if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)
			|| !isInsideCabagan(value.latitude, value.longitude)) throw createValidationError('Choose map points inside Cabagan.', 'scheduleBlocks')
		return { latitude: value.latitude, longitude: value.longitude }
	}
	const scheduleBlocks = blocks.map((block) => {
		if (!block || !Number.isInteger(block.durationMinutes) || block.durationMinutes < 15 || block.durationMinutes > 1440) throw createValidationError('Each schedule block must last 15 minutes to 24 hours.', 'scheduleBlocks')
		const label = String(block.label || '').trim()
		if (!label || label.length > 200) throw createValidationError('Name each assigned area or route (up to 200 characters).', 'scheduleBlocks')
		const result = { label, durationMinutes: block.durationMinutes, offsetMinutes }
		offsetMinutes += block.durationMinutes
		if (assignment.deploymentType === 'route') {
			if (!Array.isArray(block.routePoints) || block.routePoints.length < 2 || block.routePoints.length > 30) throw createValidationError('Set 2 to 30 route points in travel order.', 'scheduleBlocks')
			return { ...result, coverageType: 'route', routePoints: block.routePoints.map(p => ({ ...point(p), label: String(p.label || '').trim().slice(0, 200) })), ...point(block.routePoints[0]) }
		}
		if (block.coverageType === 'barangay') {
			const barangay = findCabaganBarangay(block.barangay)
			if (!barangay) throw createValidationError('Select an official Cabagan barangay.', 'scheduleBlocks')
			codes.add(barangay.code)
			return { ...result, coverageType: 'barangay', barangay: barangay.name,
				...barangayCenters[barangay.code] }
		}
		if (block.coverageType !== 'custom' || !Number.isFinite(block.radiusMeters) || block.radiusMeters < 50 || block.radiusMeters > 5000) throw createValidationError('Choose a custom area radius between 50 and 5,000 meters.', 'scheduleBlocks')
		return { ...result, coverageType: 'custom', radiusMeters: block.radiusMeters, ...point(block) }
	})
	const duration = (new Date(assignment.shiftEnd) - new Date(assignment.shiftStart)) / 60000
	if (!Number.isFinite(duration) || Math.abs(duration - offsetMinutes) > 0.001) throw createValidationError('Schedule blocks must fill the duty exactly, without gaps or overlaps.', 'scheduleBlocks')
	const first = scheduleBlocks[0]
	const vehicleId = ['car', 'motorcycle'].includes(mode) ? String(assignment.vehicleId || '') : ''
	if (['car', 'motorcycle'].includes(mode) && !vehicleId) throw createValidationError('Select the vehicle and its weekly crew.', 'vehicleId')
	return { patrolAreaId: 'scheduled-patrol', patrolArea: first.label, deploymentType: assignment.deploymentType,
		patrolMode: mode, coverageBarangayCodes: [...codes], deploymentPointLabel: first.label,
		latitude: first.latitude ?? null, longitude: first.longitude ?? null, scheduleBlocks, vehicleId, transitionGraceMinutes }
}

const patrolBlockAt = (deployment, now = new Date()) => {
	if (!deployment?.scheduleBlocks?.length) return null
	const elapsed = (now - new Date(deployment.shiftStart)) / 60000
	if (elapsed < 0 || now >= new Date(deployment.shiftEnd)) return null
	const index = deployment.scheduleBlocks.findIndex(b => elapsed >= b.offsetMinutes && elapsed < b.offsetMinutes + b.durationMinutes)
	return index < 0 ? null : { block: deployment.scheduleBlocks[index], index, next: deployment.scheduleBlocks[index + 1] }
}
const currentPatrolBlock = (deployment, now = new Date()) => deployment?.status === 'active' ? patrolBlockAt(deployment, now) : null
// Incident context follows the scheduled block at incident time, even when
// the report is submitted after the duty has finished.
const deploymentContextAt = (deployment, at) => {
	const block = patrolBlockAt(deployment, at)?.block
	if (!block) return deployment
	const barangay = findCabaganBarangay(block.barangay)
	return { ...deployment, patrolArea: block.label, deploymentPointLabel: block.label,
		coverageBarangayCodes: barangay ? [barangay.code] : [],
		location: Number.isFinite(block.latitude) && Number.isFinite(block.longitude)
			? { type: 'Point', coordinates: [block.longitude, block.latitude] } : undefined }
}
module.exports = { normalizePatrolSchedule, currentPatrolBlock, patrolBlockAt, deploymentContextAt }
