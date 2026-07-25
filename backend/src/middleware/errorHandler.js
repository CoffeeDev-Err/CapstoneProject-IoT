const errorHandler = (error, _req, res, _next) => {
	if (error?.code === 11000) {
		const field = Object.keys(error.keyPattern || {})[0] || 'value'
		return res.status(409).json({
			success: false,
			code: 'DUPLICATE_VALUE',
			message: `${field} is already in use.`,
			field,
		})
	}

	const status = error.status
		|| (error.code === 'FLESPI_NOT_CONFIGURED' ? 503 : 500)
	const expectedConfigurationError = [
		'FLESPI_NOT_CONFIGURED',
		'GPS_INGEST_NOT_CONFIGURED',
	].includes(error.code)
	if (status >= 500 && !expectedConfigurationError) {
		console.error(error)
	}

	return res.status(status).json({
		success: false,
		code: error.code || 'INTERNAL_SERVER_ERROR',
		message: error.message || 'Unable to complete the request.',
	})
}

module.exports = errorHandler
