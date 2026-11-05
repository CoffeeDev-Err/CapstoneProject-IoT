const { distanceInMeters } = require('../../utils/geo')

// These are admission limits for large outliers, not a stationary deadband.
const MIN_JUMP_METERS = 30
const POSITION_MARGIN_METERS = 15
const MAX_ACCURACY_METERS = 100
const MAX_SPEED_KMH = 300
const LOW_SPEED_KMH = 2
const WALKING_ALLOWANCE_KMH = 8
const REACQUISITION_GAP_MS = 30_000
const MIN_CONFIRMATION_MS = 5_000
const MAX_CONFIRMATION_MS = 30_000
const MAX_PENDING_FIXES = 1000

const reportedSpeed = (value) => Number.isFinite(value) && value >= 0 ? value : null

const createGpsFixGuard = ({ clock = Date.now } = {}) => {
	// Runtime GPS sync is serialized in the single backend process. Candidates
	// expire, are scoped to a device assignment, and never replace the live fix.
	const pending = new Map()
	const clear = (personnelId) => pending.delete(personnelId)
	const check = ({ personnelId, assignmentId, current, fix }) => {
		if ((Number.isFinite(fix.accuracy) && fix.accuracy > MAX_ACCURACY_METERS)
			|| (Number.isFinite(fix.satellites) && fix.satellites < 4)) {
			clear(personnelId)
			return 'poor_gps_quality'
		}

		const elapsedMs = fix.recordedAt - current?.recordedAt
		const distance = distanceInMeters(current?.location?.coordinates, fix.coordinates)
		const sameAssignment = !current?.deviceAssignmentId || current.deviceAssignmentId === assignmentId
		const canCompare = current?.source === 'gps' && sameAssignment
			&& elapsedMs > 0 && Number.isFinite(distance)
		const speed = reportedSpeed(fix.speed)
		const previousSpeed = reportedSpeed(current?.speed)
		const seconds = elapsedMs / 1000
		const exceedsTravelLimit = distance > MAX_SPEED_KMH / 3.6 * seconds + MIN_JUMP_METERS
		const slowReacquisition = elapsedMs > REACQUISITION_GAP_MS && (speed === null || speed <= LOW_SPEED_KMH)
		const contradictsSpeed = speed !== null && previousSpeed !== null
			&& speed <= LOW_SPEED_KMH && previousSpeed <= LOW_SPEED_KMH
			&& distance > WALKING_ALLOWANCE_KMH / 3.6 * seconds + POSITION_MARGIN_METERS
		const suspicious = canCompare && distance > MIN_JUMP_METERS
			&& (exceedsTravelLimit || slowReacquisition || contradictsSpeed)

		if (!suspicious) {
			clear(personnelId)
			return null
		}

		const now = clock()
		const candidate = pending.get(personnelId)
		if (candidate && candidate.assignmentId === assignmentId && now < candidate.expiresAt) {
			// Polling the same fix again (or receiving it out of order) is not
			// independent confirmation and must not extend the candidate's life.
			const confirmationMs = fix.recordedAt - candidate.recordedAt
			if (confirmationMs <= 0) return 'gps_jump_pending'
			const confirmationDistance = distanceInMeters(candidate.coordinates, fix.coordinates)
			const confirmationSpeed = Math.max(speed ?? 0, candidate.speed ?? 0, WALKING_ALLOWANCE_KMH)
			const confirmationRadius = Math.max(MIN_JUMP_METERS,
				confirmationSpeed / 3.6 * confirmationMs / 1000 + POSITION_MARGIN_METERS)
			if (confirmationMs >= MIN_CONFIRMATION_MS && confirmationMs <= MAX_CONFIRMATION_MS
				&& confirmationDistance <= confirmationRadius
				&& confirmationDistance <= MAX_SPEED_KMH / 3.6 * confirmationMs / 1000 + MIN_JUMP_METERS) {
				clear(personnelId)
				return null
			}
			if (confirmationMs < MIN_CONFIRMATION_MS) return 'gps_jump_pending'
		}

		clear(personnelId)
		if (pending.size >= MAX_PENDING_FIXES) clear(pending.keys().next().value)
		pending.set(personnelId, {
			assignmentId,
			coordinates: [...fix.coordinates],
			recordedAt: fix.recordedAt,
			speed,
			expiresAt: now + MAX_CONFIRMATION_MS,
		})
		return 'gps_jump_pending'
	}
	return { check, clear }
}

module.exports = createGpsFixGuard
