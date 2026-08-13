const parseAllowedOrigins = () => String(process.env.ALLOWED_ORIGINS || '')
	.split(',')
	.map((origin) => origin.trim().replace(/\/$/, ''))
	.filter(Boolean)

const allowedOrigins = parseAllowedOrigins()

const isAllowedOrigin = (origin) => (
	!origin
	|| (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production')
	|| allowedOrigins.includes(origin.replace(/\/$/, ''))
)

const corsOptions = {
	origin: (origin, callback) => {
		if (isAllowedOrigin(origin)) return callback(null, true)
		const error = new Error('Origin is not allowed by CORS.')
		error.status = 403
		return callback(error)
	},
	methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
	maxAge: 600,
}

module.exports = {
	allowedOrigins,
	corsOptions,
	isAllowedOrigin,
}
