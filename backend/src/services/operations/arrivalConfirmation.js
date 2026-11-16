const { distanceInMeters } = require('../../utils/geo')
const { isUsableGpsFix, snapshotGpsFix } = require('../../utils/gpsQuality')

const createArrivalConfirmation = () => {
	const candidates = new Map()
	return ({ key, requester, responder, acceptedAt, now, radius }) => {
		for (const [id, candidate] of candidates) if (+now - candidate.seenAt > 30_000) candidates.delete(id)
		const usable = [requester, responder].every(fix => isUsableGpsFix(fix, {
			now, requireAccuracy: true, maxAccuracy: Math.min(100, radius / 2), notBefore: acceptedAt,
		}) && +now - +new Date(fix.recordedAt) <= 30_000 && +new Date(fix.recordedAt) <= +now)
		const distance = usable ? distanceInMeters(requester.location.coordinates, responder.location.coordinates) : Infinity
		if (!usable || distance + requester.accuracy + responder.accuracy > radius) {
			candidates.delete(key)
			return null
		}
		const previous = candidates.get(key)
		const pair = { requester: snapshotGpsFix(requester), responder: snapshotGpsFix(responder), distanceMeters: distance }
		if (previous && previous.pair.requester.deviceAssignmentId === requester.deviceAssignmentId
			&& previous.pair.responder.deviceAssignmentId === responder.deviceAssignmentId) {
			const requesterElapsed = +new Date(requester.recordedAt) - +new Date(previous.pair.requester.recordedAt)
			const responderElapsed = +new Date(responder.recordedAt) - +new Date(previous.pair.responder.recordedAt)
			if (requesterElapsed >= 5_000 && responderElapsed >= 5_000
				&& requesterElapsed <= 30_000 && responderElapsed <= 30_000) {
				candidates.delete(key)
				return { radiusMeters: radius, first: previous.pair, confirmed: pair }
			}
			if (requesterElapsed <= 0 || responderElapsed <= 0 || Math.min(requesterElapsed, responderElapsed) < 5_000) return null
		}
		if (candidates.size >= 5000) candidates.delete(candidates.keys().next().value)
		candidates.set(key, { pair, seenAt: +now })
		return null
	}
}

module.exports = createArrivalConfirmation
