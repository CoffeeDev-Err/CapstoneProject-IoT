const { timingSafeEqual } = require('crypto')

const requireIngestKey = (req, _res, next) => {
	const configuredKey = process.env.GPS_INGEST_API_KEY
	if (!configuredKey) {
		const error = new Error('GPS ingestion is not configured.')
		error.code = 'GPS_INGEST_NOT_CONFIGURED'
		error.status = 503
		return next(error)
	}

	const providedKey = String(req.get('x-api-key') || '')
	const expected = Buffer.from(configuredKey)
	const provided = Buffer.from(providedKey)
	const valid = expected.length === provided.length
		&& timingSafeEqual(expected, provided)

	if (!valid) {
		const error = new Error('Invalid GPS ingestion API key.')
		error.code = 'INVALID_INGEST_KEY'
		error.status = 401
		return next(error)
	}

	return next()
}

module.exports = requireIngestKey
