const { getLocationFreshness } = require('../../utils/locationFreshness')
const { isInsideCabagan } = require('../../utils/cabaganGeofence')

const createPersonnelLifecycleService = ({
	models,
	currentShiftFilter,
	notificationService,
}) => {
	const { CurrentLocation, Deployment, GpsDeviceAssignment, Personnel } = models
	const { createNotification, deliverNotification } = notificationService

const evaluatePersonnelInactivity = async ({ io, now = new Date() } = {}) => {
	const inactivityMinutes = Math.max(2, Number(process.env.INACTIVITY_ALERT_MINUTES) || 5)
	const inactivityMs = inactivityMinutes * 60_000
	const deployments = await Deployment.find(currentShiftFilter(now))
		.select('assignmentId personnelId shiftStart')
		.lean()
	if (deployments.length === 0) return []

	const deploymentByPersonnel = new Map(
		deployments.map((deployment) => [deployment.personnelId, deployment]),
	)
	const personnelIds = [...deploymentByPersonnel.keys()]
	const [locations, profiles] = await Promise.all([
		CurrentLocation.find({ personnelId: { $in: personnelIds }, source: 'gps' }),
		Personnel.find({ personnelId: { $in: personnelIds }, status: 'active' })
			.select('personnelId fullName rank')
			.lean(),
	])
	const profilesById = new Map(profiles.map((profile) => [profile.personnelId, profile]))
	const alerts = []

	for (const location of locations) {
		if (getLocationFreshness({
			recordedAt: location.recordedAt || location.updatedAt,
			source: location.source,
			now,
		}).isLocationStale) continue

		const deployment = deploymentByPersonnel.get(location.personnelId)
		const movementAt = location.lastMovedAt || location.recordedAt || location.updatedAt
		const shiftStartedAt = deployment?.shiftStart || movementAt
		const monitoringStartedAt = new Date(Math.max(
			movementAt?.getTime?.() || now.getTime(),
			shiftStartedAt?.getTime?.() || now.getTime(),
		))
		if (now.getTime() - monitoringStartedAt.getTime() < inactivityMs) continue

		const result = await CurrentLocation.updateOne(
			{
				_id: location._id,
				$or: [
					{ inactivityAlertedAt: { $exists: false } },
					{ inactivityAlertedAt: null },
				],
			},
			{ $set: { inactivityAlertedAt: now } },
		)
		if (result.modifiedCount === 0) continue

		const profile = profilesById.get(location.personnelId)
		const officerName = profile?.fullName || location.personnelId
		const message = `${officerName} has no detected movement for ${inactivityMinutes} minutes during an active shift.`
		const [supervisorNotification] = await Promise.all([
			createNotification({
				recipientId: 'supervisor',
				type: 'warning',
				title: 'Personnel Inactivity',
				message,
				referenceType: 'personnel',
				referenceId: location.personnelId,
			}),
			deliverNotification({
				io,
				recipientId: location.personnelId,
				type: 'warning',
				title: 'Movement Check Required',
				message: `No movement has been detected for ${inactivityMinutes} minutes. Please confirm your status or move if safe to do so.`,
				referenceType: 'deployment',
				referenceId: deployment.assignmentId,
				priority: 'high',
				data: { destination: 'Map', assignmentId: deployment.assignmentId },
				dedupeKey: `personnel:${location.personnelId}:inactivity:${now.toISOString()}`,
			}),
		])
		const alert = {
			...supervisorNotification,
			personnelId: location.personnelId,
			personnelName: officerName,
			inactivityMinutes,
		}
		alerts.push(alert)
		io?.emit('personnel:inactivity', alert)
	}

	return alerts
}

const evaluatePersonnelGeofences = async ({ io, now = new Date() } = {}) => {
	const deployments = await Deployment.find(currentShiftFilter(now)).lean()
	if (deployments.length === 0) return []

	const personnelIds = [...new Set(deployments.map((item) => item.personnelId))]
	const [locations, assignments] = await Promise.all([
		CurrentLocation.find({ personnelId: { $in: personnelIds } }),
		GpsDeviceAssignment.find({ personnelId: { $in: personnelIds }, status: 'active' }).lean(),
	])
	const assignmentByPersonnel = new Map(
		assignments.map((assignment) => [assignment.personnelId, assignment]),
	)
	const transitions = []

	for (const location of locations) {
		const assignment = assignmentByPersonnel.get(location.personnelId)
		if (!assignment || location.deviceAssignmentId !== assignment.assignmentId) continue
		if (getLocationFreshness({
			recordedAt: location.recordedAt || location.updatedAt,
			source: location.source,
			now,
		}).isLocationStale) continue

		const [longitude, latitude] = location.location?.coordinates || []
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
		const nextStatus = isInsideCabagan(latitude, longitude) ? 'inside' : 'outside'
		const previousStatus = location.geofenceStatus
		if (previousStatus === nextStatus) continue

		const result = await CurrentLocation.updateOne(
			{
				_id: location._id,
				...(previousStatus
					? { geofenceStatus: previousStatus }
					: { $or: [{ geofenceStatus: { $exists: false } }, { geofenceStatus: null }] }),
			},
			{
				$set: {
					geofenceStatus: nextStatus,
					geofenceBoundaryId: 'cabagan-municipal',
					geofenceTransitionAt: now,
				},
			},
		)
		if (result.modifiedCount === 0) continue

		if (previousStatus !== 'outside' && nextStatus === 'inside') continue
		const isOutside = nextStatus === 'outside'
		const notification = await deliverNotification({
			io,
			recipientId: location.personnelId,
			type: isOutside ? 'geofence' : 'success',
			title: isOutside ? 'Boundary Warning' : 'Back Inside Boundary',
			message: isOutside
				? 'Your assigned GPS device has moved outside the allowed Cabagan boundary.'
				: 'Your assigned GPS device is back inside the allowed Cabagan boundary.',
			referenceType: 'geofence',
			referenceId: assignment.assignmentId,
			priority: isOutside ? 'critical' : 'low',
			data: { destination: 'Map', latitude, longitude, boundaryId: 'cabagan-municipal' },
			dedupeKey: `geofence:${assignment.assignmentId}:${nextStatus}:${now.toISOString()}`,
		})
		const transition = {
			...notification,
			personnelId: location.personnelId,
			status: nextStatus,
			latitude,
			longitude,
		}
		transitions.push(transition)
		io?.emit('geofence:transition', transition)
	}

	return transitions
}

	return { evaluatePersonnelGeofences, evaluatePersonnelInactivity }
}

module.exports = createPersonnelLifecycleService
