const { createHash } = require('node:crypto')
const { distanceInMeters, isValidCoordinates } = require('../../utils/geo')

const numberOrNull = value => value == null || value === '' ? null : Number(value)
const coordinates = point => [Number(point.longitude), Number(point.latitude)]
const validPair = pair => Array.isArray(pair) && pair.length === 2 && isValidCoordinates(pair[1], pair[0])

// Matching is display-only. Never modify saved snapshots or operational positions.
const prepareSegments = points => {
	const segments = []
	let segment = []
	let previous
	let anchor
	const finish = () => {
		if (segment.length >= 3) segments.push(segment)
		segment = []; previous = null; anchor = null
	}
	for (const point of points) {
		const accuracy = numberOrNull(point.accuracy)
		const time = Date.parse(point.recorded_at)
		if (point.latitude == null || point.longitude == null || point.latitude === '' || point.longitude === ''
			|| !validPair(coordinates(point)) || !Number.isFinite(time) || point.position_valid === false
			|| (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50))) {
			finish(); continue
		}
		if (previous) {
			const elapsed = time - Date.parse(previous.recorded_at)
			if (elapsed < 1000 || elapsed > 60_000
				|| distanceInMeters(coordinates(previous), coordinates(point)) / (elapsed / 1000) > 55) finish()
		}
		if (anchor) {
			const stationary = numberOrNull(anchor.speed) === 0 && numberOrNull(point.speed) === 0
			const uncertainty = Math.max(stationary ? 50 : 3, Math.min(50, (numberOrNull(anchor.accuracy) || 0) + (accuracy || 0)))
			if (distanceInMeters(coordinates(anchor), coordinates(point)) <= uncertainty) {
				previous = point; continue
			}
		}
		segment.push(point); previous = point; anchor = point
	}
	finish()
	return segments
}

// Per-leg step geometry lets us exclude an uncertain endpoint without keeping
// its road segment or replacing it with a straight line between raw fixes.
const geometryForRun = (matching, indices, tracepoints, points) => {
	if (!Array.isArray(matching.legs)) return null
	const line = []
	for (let offset = 1; offset < indices.length; offset++) {
		const first = tracepoints[indices[offset - 1]]
		const last = tracepoints[indices[offset]]
		if (!Number.isInteger(first.waypoint_index) || first.waypoint_index < 0
			|| last.waypoint_index !== first.waypoint_index + 1) return null
		const leg = matching.legs[first.waypoint_index]
		if (!Array.isArray(leg?.steps) || !leg.steps.length || leg.steps.length > 10_000) return null
		const legLine = []
		for (const step of leg.steps) {
			const pairs = step.geometry?.coordinates
			if (step.geometry?.type !== 'LineString' || !Array.isArray(pairs) || !pairs.length
				|| pairs.length > 10_000 || !pairs.every(validPair)) return null
			if (legLine.length && distanceInMeters(legLine.at(-1), pairs[0]) > 1) return null
			for (const pair of pairs) {
				if (!legLine.length || distanceInMeters(legLine.at(-1), pair) > 0) legLine.push(pair)
				if (legLine.length > 10_000) return null
			}
		}
		if (legLine.length < 2 || distanceInMeters(legLine[0], first.location) > 1
			|| distanceInMeters(legLine.at(-1), last.location) > 1) return null
		const duration = (Date.parse(points[indices[offset]].recorded_at) - Date.parse(points[indices[offset - 1]].recorded_at)) / 1000
		const distance = legLine.slice(1).reduce((total, pair, index) => total + distanceInMeters(legLine[index], pair), 0)
		if (duration <= 0 || distance / duration > 55) return null
		if (line.length && distanceInMeters(line.at(-1), legLine[0]) > 1) return null
		for (const pair of legLine) {
			if (!line.length || distanceInMeters(line.at(-1), pair) > 0) line.push(pair)
			if (line.length > 10_000) return null
		}
	}
	return line
}

const acceptedMatches = (response, points) => {
	if (response?.code !== 'Ok' || !Array.isArray(response.matchings)
		|| !Array.isArray(response.tracepoints) || response.tracepoints.length !== points.length) return { segments: [], complete: false }
	const covered = new Set()
	const segments = response.matchings.flatMap((matching, matchingIndex) => {
		const geometry = matching.geometry
		if (!Number.isFinite(matching.confidence) || matching.confidence < 0.8 || matching.confidence > 1
			|| geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)
			|| geometry.coordinates.length < 2 || geometry.coordinates.length > 10_000
			|| !geometry.coordinates.every(validPair)) return []
		const matchingIndices = response.tracepoints.flatMap((point, index) => point?.matchings_index === matchingIndex ? [index] : [])
		const runs = []
		let run = []
		const finish = () => { if (run.length >= 3) runs.push(run); run = [] }
		response.tracepoints.forEach((match, index) => {
			if (match?.matchings_index !== matchingIndex || (match.alternatives_count != null && match.alternatives_count !== 0)
				|| !validPair(match.location) || distanceInMeters(coordinates(points[index]), match.location) > 75) finish()
			else run.push(index)
		})
		finish()
		return runs.flatMap(indices => {
			// Older compatible providers may omit steps. Their overview is usable
			// only when every point in the complete matching remains trustworthy.
			const line = Array.isArray(matching.legs) ? geometryForRun(matching, indices, response.tracepoints, points)
				: indices.length === matchingIndices.length ? geometry.coordinates : null
			if (!line || line.length < 2) return []
			const duration = (Date.parse(points[indices.at(-1)].recorded_at) - Date.parse(points[indices[0]].recorded_at)) / 1000
			const distance = line.slice(1).reduce((total, pair, index) => total + distanceInMeters(line[index], pair), 0)
			if (duration <= 0 || distance / duration > 55) return []
			indices.forEach(index => covered.add(index))
			return [{ coordinates: line, confidence: matching.confidence,
				from: points[indices[0]].recorded_at, to: points[indices.at(-1)].recorded_at }]
		})
	})
	return { segments, complete: covered.size === points.length }
}

const createReportRoadMatchingService = ({ environment = process.env, fetchImpl = fetch, clock = Date.now } = {}) => {
	let endpoint
	try {
		const candidate = new URL(environment.REPORT_MAP_MATCHING_URL)
		if (['http:', 'https:'].includes(candidate.protocol) && !candidate.username && !candidate.password
			&& !candidate.search && !candidate.hash) endpoint = candidate.href.replace(/\/$/, '')
	} catch { /* No provider is enabled by default. */ }
	const cache = new Map()
	const isAvailable = () => Boolean(endpoint)
	const result = (status, segments = [], extra = {}) => ({ available: isAvailable(), status, segments, inference: true, ...extra })
	const match = async points => {
		if (!endpoint) return result('disabled')
		const segments = prepareSegments(points)
		if (!segments.length) return result('insufficient_movement')
		const chunks = segments.flatMap(segment => {
			const output = []
			for (let index = 0; index < segment.length - 2; index += 78) output.push(segment.slice(index, index + 80))
			return output
		})
		if (chunks.length > 6) return result('trace_too_large')
		const key = createHash('sha256').update(JSON.stringify([endpoint, chunks])).digest('hex')
		const existing = cache.get(key)
		if (existing && existing.expires > clock()) return existing.promise
		cache.delete(key)
		while (cache.size >= 50) cache.delete(cache.keys().next().value)
		const promise = (async () => {
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), 8000)
			try {
				const matched = []
				let rejected = false
				for (const chunk of chunks) {
					const url = new URL(`${endpoint}/match/v1/driving/${chunk.map(point => coordinates(point).join(',')).join(';')}`)
					url.search = new URLSearchParams({ geometries: 'geojson', overview: 'full', steps: 'true', gaps: 'split', tidy: 'false',
						timestamps: chunk.map(point => Math.floor(Date.parse(point.recorded_at) / 1000)).join(';'),
						radiuses: chunk.map(point => numberOrNull(point.accuracy) ?? 25).join(';') }).toString()
					const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' })
					if (!response.ok) throw new Error('Matching provider unavailable')
					const body = await response.json()
					const accepted = acceptedMatches(body, chunk)
					if (!accepted.complete) rejected = true
					matched.push(...accepted.segments)
				}
				return result(matched.length ? rejected ? 'partial' : 'matched' : 'no_confident_match', matched, {
					profile: 'vehicle', assumed_accuracy_radius_m: chunks.flat().some(point => numberOrNull(point.accuracy) == null) ? 25 : null,
				})
			} catch {
				return result('unavailable')
			} finally {
				clearTimeout(timer)
			}
		})()
		cache.set(key, { expires: clock() + 60_000, promise })
		const output = await promise
		if (output.status === 'unavailable') cache.delete(key)
		return output
	}
	return { isAvailable, match }
}

module.exports = createReportRoadMatchingService
