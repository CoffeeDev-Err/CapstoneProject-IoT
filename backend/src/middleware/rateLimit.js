const buckets = new Map()
let lastPrunedAt = 0

const pruneExpiredBuckets = (now) => {
	if (now - lastPrunedAt < 60_000) return
	lastPrunedAt = now
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key)
	}
}

const createRateLimit = ({
	windowMs = 15 * 60 * 1000,
	max = 20,
	keyPrefix = 'request',
} = {}) => (req, res, next) => {
	const now = Date.now()
	pruneExpiredBuckets(now)
	const key = `${keyPrefix}:${req.ip}`
	let bucket = buckets.get(key)
	if (!bucket || bucket.resetAt <= now) {
		bucket = { count: 0, resetAt: now + windowMs }
		buckets.set(key, bucket)
	}

	bucket.count += 1
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
