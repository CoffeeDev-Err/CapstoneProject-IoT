const { distanceInMeters } = require('../utils/geo')
const { getLocationFreshness } = require('../utils/locationFreshness')
const { currentPatrolBlock } = require('./patrolSchedule')
const { loadBarangayBoundaries, getPatrolDirections } = require('./patrolMapService')
const { createHash } = require('crypto')

const insideRing = (x, y, ring) => {
	let inside = false
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i], [xj, yj] = ring[j]
		if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
	}
	return inside
}
const insideGeometry = (longitude, latitude, geometry) => {
	const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
	return polygons.some(rings => insideRing(longitude, latitude, rings[0]) && !rings.slice(1).some(r => insideRing(longitude, latitude, r)))
}
const segmentDistance = (point, a, b) => {
	const scale = Math.cos(point[1] * Math.PI / 180)
	const x = (b[0] - a[0]) * scale, y = b[1] - a[1]
	const t = Math.max(0, Math.min(1, (((point[0] - a[0]) * scale) * x + (point[1] - a[1]) * y) / (x*x + y*y || 1)))
	return distanceInMeters(point, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
}
const outsideCoverage = (block, coordinates, accuracy = 0, patrolMode = '') => {
	const margin = Math.max(50, accuracy)
	if (block.coverageType === 'custom') return distanceInMeters(coordinates, [block.longitude, block.latitude]) > block.radiusMeters + margin
	if (block.coverageType === 'route') {
		// Vehicle waypoint guides may cut across buildings or bends. Only the
		// saved road geometry, or an explicitly plotted foot path, defines coverage.
		const points = block.geometry?.type === 'LineString' ? block.geometry.coordinates : null
		if (!points || points.length < 2 || (patrolMode !== 'walk' && block.roadDirections !== true)
			|| points.some(p => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite))) return null
		const allowance = (block.routeCorridorMeters ?? 100) + margin
		return !points.slice(1).some((b, i) => segmentDistance(coordinates, points[i], b) <= allowance)
	}
	if (!block.geometry || block.coverageType !== 'barangay') return null
	if (insideGeometry(...coordinates, block.geometry)) return false
	const polygons = block.geometry.type === 'Polygon' ? [block.geometry.coordinates] : block.geometry.coordinates
	const nearBoundary = polygons.some(p => p.some(r => r.slice(1).some((b, i) => segmentDistance(coordinates, r[i], b) <= margin)))
	return nearBoundary ? null : true
}

const hydratePatrolGeometry = async (assignments, previousById) => {
	let boundaries
	const routeRequests = new Map()
	for (const assignment of assignments) {
		if (!['car', 'motorcycle', 'walk'].includes(assignment.patrolMode)) continue
		for (const block of assignment.scheduleBlocks || []) {
			if (block.coverageType !== 'route') continue
			const old = previousById.get(assignment.id)?.scheduleBlocks?.find(b => JSON.stringify(b.routePoints) === JSON.stringify(block.routePoints))
			if (old?.geometry && (old.roadDirections === true || assignment.patrolMode === 'walk') && previousById.get(assignment.id)?.patrolMode === assignment.patrolMode) continue
			const key = `${assignment.patrolMode}:${JSON.stringify(block.routePoints)}`
			if (!routeRequests.has(key)) routeRequests.set(key, getPatrolDirections({ points: block.routePoints, mode: assignment.patrolMode }))
		}
	}
	if (assignments.some(a => a.scheduleBlocks?.some(b => b.coverageType === 'barangay'))) {
		try { boundaries = await loadBarangayBoundaries() } catch { boundaries = null }
	}
	for (const assignment of assignments) {
		for (const block of assignment.scheduleBlocks || []) {
			if (block.coverageType === 'barangay') {
				const feature = boundaries?.features.find(f => f.properties.barangay === block.barangay)
				const old = previousById.get(assignment.id)?.scheduleBlocks?.find(b => b.coverageType === 'barangay' && b.barangay === block.barangay)
				block.geometry = feature?.geometry || old?.geometry || null
				block.boundarySource = boundaries?.attribution || old?.boundarySource || ''
				if (block.geometry) {
					const points = block.geometry.type === 'Polygon' ? block.geometry.coordinates.flat() : block.geometry.coordinates.flat(2)
					block.longitude = (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2
					block.latitude = (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2
				}
			} else if (block.coverageType === 'route') {
				const old = previousById.get(assignment.id)?.scheduleBlocks?.find(b => JSON.stringify(b.routePoints) === JSON.stringify(block.routePoints))
				if (old?.geometry && (assignment.patrolMode === 'walk' || old.roadDirections === true) && previousById.get(assignment.id)?.patrolMode === assignment.patrolMode) {
					block.geometry = old.geometry; block.roadDirections = old.roadDirections
				} else {
					const route = await routeRequests.get(`${assignment.patrolMode}:${JSON.stringify(block.routePoints)}`)
					// Explicit point order is always available, including foot patrol.
					block.geometry = route?.available ? route.geometry : { type: 'LineString', coordinates: block.routePoints.map(p => [p.longitude, p.latitude]) }
					block.roadDirections = Boolean(route?.available)
				}
			}
		}
	}
}

const createPatrolCoverageService = ({ Deployment, CurrentLocation, deliverNotification }) => async ({ io, now = new Date() } = {}) => {
	const deployments = await Deployment.find({ status: 'active', shiftStart: { $lte: now }, shiftEnd: { $gt: now }, 'scheduleBlocks.0': { $exists: true } }).lean()
	for (const deployment of deployments) {
		const current = currentPatrolBlock(deployment, now)
		if (!current) continue
		const { block, index, next } = current
		const end = +new Date(deployment.shiftStart) + (block.offsetMinutes + block.durationMinutes) * 60000
		const base = { io, recipientId: deployment.personnelId, type: 'info', referenceType: 'deployment', referenceId: deployment.assignmentId,
			data: { destination: 'Map', assignmentId: deployment.assignmentId } }
		if (next && end - now <= 10 * 60000) await deliverNotification({ ...base, title: 'Next patrol area soon',
			message: `Your schedule at ${block.label} ends in ${Math.max(1, Math.ceil((end - now) / 60000))} minutes. Next: ${next.label}. Open View next area to prepare.`,
			dedupeKey: `patrol-soon:${deployment.assignmentId}:${deployment.shiftStart.toISOString()}:${index}` })
		if (index > 0 && now - (+new Date(deployment.shiftStart) + block.offsetMinutes * 60000) < 10 * 60000) await deliverNotification({ ...base,
			title: 'Move to your next patrol area', message: `Your assigned area is now ${block.label}. Open the map to view your coverage.`,
			dedupeKey: `patrol-start:${deployment.assignmentId}:${deployment.shiftStart.toISOString()}:${index}` })
		const blockStart = +new Date(deployment.shiftStart) + block.offsetMinutes * 60000
		if (index > 0 && now - blockStart < (deployment.transitionGraceMinutes ?? 10) * 60000) continue
		const location = await CurrentLocation.findOne({ personnelId: deployment.personnelId }).lean()
		if (!location || location.source !== 'gps' || location.isSimulated || !location.recordedAt
			|| getLocationFreshness({ recordedAt: location.recordedAt, source: location.source, now }).isLocationStale
			|| location.positionValid === false || (Number.isFinite(location.satellites) && location.satellites < 4)
			|| (Number.isFinite(location.accuracy) && location.accuracy > 100)) continue
		// A fix predating the new coverage is never used to accuse an officer of leaving it.
		if (+new Date(location.recordedAt) < +new Date(deployment.shiftStart) + block.offsetMinutes * 60000) continue
		const coordinates = location.location?.coordinates
		if (!coordinates || !coordinates.every(Number.isFinite)) continue
		const outside = outsideCoverage(block, coordinates, location.accuracy || 0, deployment.patrolMode)
		if (outside === null) continue
		const key = createHash('sha256').update(`${deployment.shiftStart.toISOString()}:${index}:${JSON.stringify(block)}`).digest('hex')
		const previous = deployment.patrolCoverageState?.key === key ? deployment.patrolCoverageState : {}
		if (+new Date(previous.recordedAt) === +new Date(location.recordedAt)) continue
		const consecutiveCount = +new Date(location.recordedAt) - +new Date(previous.recordedAt) <= 120000 ? previous.candidateCount || 0 : 0
		const count = outside ? consecutiveCount + 1 : 0
		const alerted = outside ? previous.alerted || count >= 3 : false
		const result = await Deployment.updateOne({ _id: deployment._id, updatedAt: deployment.updatedAt }, {
			$set: { patrolCoverageState: { key, recordedAt: location.recordedAt, candidateCount: count, alerted } },
		})
		if (!result.modifiedCount || !alerted || previous.alerted) continue
		const route = block.coverageType === 'route'
		await Promise.all([deliverNotification({ ...base, type: 'geofence', priority: 'high', title: route ? 'Outside assigned patrol route' : 'Outside assigned patrol coverage',
			message: route ? `Your recent GPS readings are outside the allowed corridor of ${block.label}. Return to your assigned route or contact your supervisor.` : `Your recent GPS readings are outside ${block.label}. Return to your coverage or contact your supervisor.`, dedupeKey: `patrol-out:${deployment.assignmentId}:${index}:${location.recordedAt.toISOString()}` }),
			deliverNotification({ ...base, recipientId: 'supervisor', type: 'geofence', priority: 'high', title: route ? 'Personnel outside assigned route' : 'Personnel outside assigned coverage',
				message: `${deployment.personnelName} has moved outside ${route ? 'the allowed corridor of ' : ''}${block.label}.`, referenceType: 'personnel', referenceId: deployment.personnelId,
				data: { destination: 'Map', personnelId: deployment.personnelId }, dedupeKey: `patrol-out:${deployment.assignmentId}:${index}:${location.recordedAt.toISOString()}` })])
	}
}
module.exports = { insideGeometry, outsideCoverage, segmentDistance, hydratePatrolGeometry, createPatrolCoverageService }
