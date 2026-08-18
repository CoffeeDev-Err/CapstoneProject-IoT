const PLACEHOLDER_PATTERN = /(?:replace-with|change-me|changeme|example|placeholder)/i

const readValue = (environment, name) => String(environment[name] || '').trim()

const parseTrustProxy = (value) => {
	const normalized = String(value || '').trim().toLowerCase()
	if (normalized === 'true') return true
	if (/^\d+$/.test(normalized)) return Number(normalized)
	return false
}

const validateAllowedOrigins = (value, errors) => {
	const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean)
	if (origins.length === 0) {
		errors.push('ALLOWED_ORIGINS must contain at least one HTTPS origin.')
		return
	}
	for (const origin of origins) {
		try {
			const url = new URL(origin)
			if (
				url.protocol !== 'https:'
				|| url.origin !== origin.replace(/\/$/, '')
				|| origin.includes('*')
			) {
				errors.push('Every ALLOWED_ORIGINS entry must be an exact HTTPS origin without wildcards or paths.')
				return
			}
		} catch {
			errors.push('Every ALLOWED_ORIGINS entry must be a valid HTTPS origin.')
			return
		}
	}
}

const validateSecret = (environment, name, errors) => {
	const value = readValue(environment, name)
	if (value.length < 32 || PLACEHOLDER_PATTERN.test(value)) {
		errors.push(`${name} must be a non-placeholder secret of at least 32 characters.`)
	}
	return value
}

const validateProductionEnvironment = (environment = process.env) => {
	if (readValue(environment, 'NODE_ENV') !== 'production') {
		return { isProduction: false }
	}

	const errors = []
	const mongoUri = readValue(environment, 'MONGO_URI')
	if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
		errors.push('MONGO_URI must be a MongoDB connection string.')
	}

	validateAllowedOrigins(readValue(environment, 'ALLOWED_ORIGINS'), errors)

	const trustProxy = readValue(environment, 'TRUST_PROXY')
	if (!/^[1-9]\d*$/.test(trustProxy) || Number(trustProxy) > 10) {
		errors.push('TRUST_PROXY must be the explicit number of trusted reverse proxies (1-10).')
	}

	const otpSecret = validateSecret(environment, 'OTP_SECRET', errors)
	const ingestKey = validateSecret(environment, 'GPS_INGEST_API_KEY', errors)
	if (otpSecret && otpSecret === ingestKey) {
		errors.push('OTP_SECRET and GPS_INGEST_API_KEY must be different secrets.')
	}

	const mediaSigningSecret = validateSecret(environment, 'MEDIA_URL_SIGNING_SECRET', errors)
	if (
		mediaSigningSecret
		&& (mediaSigningSecret === otpSecret || mediaSigningSecret === ingestKey)
	) {
		errors.push('MEDIA_URL_SIGNING_SECRET must be different from OTP_SECRET and GPS_INGEST_API_KEY.')
	}

	if (readValue(environment, 'EMAIL_DELIVERY_MODE').toLowerCase() !== 'gmail') {
		errors.push('EMAIL_DELIVERY_MODE must be gmail in production.')
	}
	if (!readValue(environment, 'GMAIL_USER') || !readValue(environment, 'GMAIL_APP_PASSWORD')) {
		errors.push('GMAIL_USER and GMAIL_APP_PASSWORD are required for production OTP delivery.')
	}

	if (errors.length > 0) {
		const error = new Error(`Unsafe production configuration:\n- ${errors.join('\n- ')}`)
		error.code = 'UNSAFE_PRODUCTION_CONFIGURATION'
		throw error
	}

	return { isProduction: true }
}

module.exports = {
	parseTrustProxy,
	validateProductionEnvironment,
}
