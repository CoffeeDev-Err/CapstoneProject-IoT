const buckets = new Map()
let lastPrunedAt = 0

// Buckets are per-process and in-memory, so the map must not be allowed to grow
// with every distinct client address. The cap bounds worst-case memory; a small
// municipal deployment never approaches it in a single window.
const MAX_TRACKED_BUCKETS = 10_000
const PRUNE_INTERVAL_MS = 60_000

const pruneExpiredBuckets = (now) => {
	lastPrunedAt = now
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key)
	}
}

const maybePruneExpiredBuckets = (now) => {
	if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return
	pruneExpiredBuckets(now)
}

/**
 * Identifies the caller for limiting purposes. `req.ip` is undefined when the
 * trusted-proxy depth is misconfigured; falling back to a constant would quietly
 * merge every client into one bucket, so unidentifiable callers are limited
 * together under an explicit key instead of being let through unlimited.
 */
const resolveClientKey = (req) => {
	const address = req.ip || req.socket?.remoteAddress
	return address ? String(address) : 'unidentified'
}

const createRateLimit = ({
	windowMs = 15 * 60 * 1000,
	max = 20,
	keyPrefix = 'request',
} = {}) => (req, res, next) => {
	const now = Date.now()
	maybePruneExpiredBuckets(now)
	const key = `${keyPrefix}:${resolveClientKey(req)}`
	let bucket = buckets.get(key)

	if (!bucket || bucket.resetAt <= now) {
		if (!buckets.has(key) && buckets.size >= MAX_TRACKED_BUCKETS) {
			// Force a prune before giving up, then fail closed rather than evict a
			// legitimate caller's counter (eviction would let an attacker reset it).
			pruneExpiredBuckets(now)
			if (buckets.size >= MAX_TRACKED_BUCKETS) {
				res.set('Retry-After', String(Math.ceil(windowMs / 1000)))
				return res.status(429).json({
					success: false,
					code: 'RATE_LIMITED',
					message: 'Too many requests. Please try again later.',
				})
			}
		}
		bucket = { count: 0, resetAt: now + windowMs }
		buckets.set(key, bucket)
	}

	// Stop incrementing once the limit is exceeded so a sustained flood cannot
	// grow the counter without bound within a window.
	if (bucket.count <= max) bucket.count += 1
	res.set('RateLimit-Limit', String(max))
	res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
	res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

	if (bucket.count <= max) return next()
	res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
	return res.status(429).json({
		success: false,
		code: 'RATE_LIMITED',
		message: 'Too many requests. Please try again later.',
	})
}

module.exports = createRateLimit
