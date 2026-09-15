const {
	getLocationFreshness,
	getLocationStaleThresholdMs,
} = require('../../utils/locationFreshness')
const { isInsideCabagan } = require('../../utils/cabaganGeofence')

const createPersonnelLifecycleService = ({
	models,
	currentShiftFilter,
	notificationService,
}) => {
	const { CurrentLocation, Deployment, GpsDeviceAssignment, Personnel } = models
	const { deliverNotification } = notificationService
	const maxGeofenceAccuracyMeters = Math.max(
		10,
		Number(process.env.GEOFENCE_MAX_ACCURACY_METERS) || 100,
	)
	const geofenceConfirmationReadings = Math.max(
		2,
		Math.floor(Number(process.env.GEOFENCE_CONFIRMATION_READINGS) || 2),
	)
	const geofenceAlertCooldownMs = Math.max(
		1,
		Number(process.env.GEOFENCE_ALERT_COOLDOWN_MINUTES) || 2,
	) * 60_000
	const gpsUnavailableGraceMs = Math.max(
		30,
		Number(process.env.GPS_UNAVAILABLE_ALERT_GRACE_SECONDS) || 120,
	) * 1000

	const evaluatePersonnelGpsAvailability = async ({ io, now = new Date() } = {}) => {
		const deployments = await Deployment.find(currentShiftFilter(now))
			.select('assignmentId personnelId shiftStart gpsUnavailableAlertedAt')
			.lean()
		if (deployments.length === 0) return []

		const personnelIds = [...new Set(deployments.map((deployment) => deployment.personnelId))]
		const [locations, profiles] = await Promise.all([
			CurrentLocation.find({ personnelId: { $in: personnelIds } }).lean(),
			Personnel.find({ personnelId: { $in: personnelIds }, status: 'active' })
				.select('personnelId fullName')
				.lean(),
		])
		const locationByPersonnel = new Map(
			locations.map((location) => [location.personnelId, location]),
		)
		const profileByPersonnel = new Map(
			profiles.map((profile) => [profile.personnelId, profile]),
		)
		const alerts = []

		for (const deployment of deployments) {
			const location = locationByPersonnel.get(deployment.personnelId)
			const coordinates = location?.location?.coordinates || []
			const recordedAt = location?.recordedAt || location?.updatedAt
			const recordedTime = recordedAt ? new Date(recordedAt).getTime() : Number.NaN
			const hasCoordinates = Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])
			const ageMs = Number.isFinite(recordedTime) ? now.getTime() - recordedTime : Number.POSITIVE_INFINITY
			const freshness = getLocationFreshness({
				recordedAt,
				source: location?.source || 'gps',
				now,
			})
			const hasFreshLocation = Boolean(
				location
				&& hasCoordinates
				&& !freshness.isLocationStale
				&& ageMs <= getLocationStaleThresholdMs()
				&& ageMs >= -5 * 60_000,
			)

			if (hasFreshLocation) {
				if (deployment.gpsUnavailableAlertedAt) {
					await Deployment.updateOne(
						{ _id: deployment._id, gpsUnavailableAlertedAt: deployment.gpsUnavailableAlertedAt },
						{ $unset: { gpsUnavailableAlertedAt: '' } },
					)
				}
				continue
			}

			const shiftStartedAt = deployment.shiftStart ? new Date(deployment.shiftStart) : now
			if (now.getTime() - shiftStartedAt.getTime() < gpsUnavailableGraceMs) continue
			if (deployment.gpsUnavailableAlertedAt) continue

			const claimed = await Deployment.updateOne(
				{
					_id: deployment._id,
					$or: [
						{ gpsUnavailableAlertedAt: { $exists: false } },
						{ gpsUnavailableAlertedAt: null },
					],
				},
				{ $set: { gpsUnavailableAlertedAt: now } },
			)
			if (claimed.modifiedCount === 0) continue

			const officerName = profileByPersonnel.get(deployment.personnelId)?.fullName
				|| deployment.personnelId
			const outageStartedAt = Number.isFinite(recordedTime) ? new Date(recordedTime) : shiftStartedAt
			const outageKey = outageStartedAt.toISOString()
			const officerMessage = 'No recent location was received. Check that your assigned GPS tracker is powered on, charged, connected to mobile data, and with you during duty.'
			try {
				const [supervisorNotification] = await Promise.all([
					deliverNotification({
						io,
						recipientId: 'supervisor',
						type: 'warning',
						title: 'Personnel GPS Unavailable',
						message: `${officerName}'s assigned GPS tracker has not sent a current location during an active deployment.`,
						referenceType: 'personnel',
						referenceId: deployment.personnelId,
						priority: 'high',
						data: { destination: 'Map', personnelId: deployment.personnelId },
						dedupeKey: `personnel:${deployment.personnelId}:supervisor-gps-unavailable:${outageKey}`,
					}),
					deliverNotification({
						io,
						recipientId: deployment.personnelId,
						type: 'warning',
						title: 'GPS Tracking Unavailable',
						message: officerMessage,
						referenceType: 'deployment',
						referenceId: deployment.assignmentId,
						priority: 'high',
						data: { destination: 'Map', assignmentId: deployment.assignmentId },
						dedupeKey: `personnel:${deployment.personnelId}:gps-unavailable:${outageKey}`,
					}),
				])
				const alert = {
					...supervisorNotification,
					personnelId: deployment.personnelId,
					personnelName: officerName,
					assignmentId: deployment.assignmentId,
					outageStartedAt: outageKey,
				}
				alerts.push(alert)
				io?.emit('personnel:gps-unavailable', alert)
			} catch (error) {
				await Deployment.updateOne(
					{ _id: deployment._id, gpsUnavailableAlertedAt: now },
					{ $unset: { gpsUnavailableAlertedAt: '' } },
				)
				throw error
			}
		}

		return alerts
	}

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
			deliverNotification({
				io,
				recipientId: 'supervisor',
				type: 'warning',
				title: 'Personnel Inactivity',
				message,
				referenceType: 'personnel',
				referenceId: location.personnelId,
				data: { destination: 'Map', personnelId: location.personnelId },
				dedupeKey: `personnel:${location.personnelId}:supervisor-inactivity:${now.toISOString()}`,
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
		if (location.source !== 'gps' || location.isSimulated) continue
		if (getLocationFreshness({
			recordedAt: location.recordedAt || location.updatedAt,
			source: location.source,
			now,
		}).isLocationStale) continue
		if (
			Number.isFinite(location.accuracy)
			&& location.accuracy > maxGeofenceAccuracyMeters
		) {
			if (location.geofenceCandidateStatus || location.geofenceCandidateCount) {
				await CurrentLocation.updateOne(
					{ _id: location._id, recordedAt: location.recordedAt },
					{
						$unset: {
							geofenceCandidateStatus: '',
							geofenceCandidateRecordedAt: '',
						},
						$set: { geofenceCandidateCount: 0 },
					},
				)
			}
			continue
		}

		const [longitude, latitude] = location.location?.coordinates || []
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
		const nextStatus = isInsideCabagan(latitude, longitude) ? 'inside' : 'outside'
		const previousStatus = location.geofenceStatus
		if (!previousStatus && nextStatus === 'inside') {
			await CurrentLocation.updateOne(
				{ _id: location._id, recordedAt: location.recordedAt },
				{
					$set: {
						geofenceStatus: 'inside',
						geofenceBoundaryId: 'cabagan-municipal',
						geofenceCandidateCount: 0,
					},
					$unset: {
						geofenceCandidateStatus: '',
						geofenceCandidateRecordedAt: '',
					},
				},
			)
			continue
		}
		if (previousStatus === nextStatus) {
			if (location.geofenceCandidateStatus || location.geofenceCandidateCount) {
				await CurrentLocation.updateOne(
					{ _id: location._id, recordedAt: location.recordedAt },
					{
						$unset: {
							geofenceCandidateStatus: '',
							geofenceCandidateRecordedAt: '',
						},
						$set: { geofenceCandidateCount: 0 },
					},
				)
			}
			continue
		}

		const readingAt = location.recordedAt || location.updatedAt
		const candidateReadingAt = location.geofenceCandidateRecordedAt
		if (
			candidateReadingAt
			&& readingAt
			&& candidateReadingAt.getTime() === readingAt.getTime()
		) continue
		const candidateCount = location.geofenceCandidateStatus === nextStatus
			? Number(location.geofenceCandidateCount || 0) + 1
			: 1
		if (candidateCount < geofenceConfirmationReadings) {
			await CurrentLocation.updateOne(
				{ _id: location._id, recordedAt: location.recordedAt },
				{
					$set: {
						geofenceCandidateStatus: nextStatus,
						geofenceCandidateCount: candidateCount,
						geofenceCandidateRecordedAt: readingAt,
					},
				},
			)
			continue
		}

		const previousTransitionAt = location.geofenceTransitionAt?.getTime?.() || 0
		const result = await CurrentLocation.updateOne(
			{
				_id: location._id,
				recordedAt: location.recordedAt,
				...(previousStatus
					? { geofenceStatus: previousStatus }
					: { $or: [{ geofenceStatus: { $exists: false } }, { geofenceStatus: null }] }),
			},
			{
				$set: {
					geofenceStatus: nextStatus,
					geofenceBoundaryId: 'cabagan-municipal',
					geofenceTransitionAt: now,
					geofenceCandidateCount: 0,
				},
				$unset: {
					geofenceCandidateStatus: '',
					geofenceCandidateRecordedAt: '',
				},
			},
		)
		if (result.modifiedCount === 0) continue

		if (previousStatus !== 'outside' && nextStatus === 'inside') continue
		const isOutside = nextStatus === 'outside'
		const alertSuppressed = Boolean(
			previousTransitionAt
			&& now.getTime() - previousTransitionAt < geofenceAlertCooldownMs,
		)
		const notification = alertSuppressed
			? null
			: await deliverNotification({
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
			...(notification || {}),
			personnelId: location.personnelId,
			status: nextStatus,
			latitude,
			longitude,
			alertSuppressed,
		}
		transitions.push(transition)
		io?.emit('geofence:transition', transition)
	}

	return transitions
}

	return {
		evaluatePersonnelGeofences,
		evaluatePersonnelGpsAvailability,
		evaluatePersonnelInactivity,
	}
}

module.exports = createPersonnelLifecycleService
