const securityHeaders = (req, res, next) => {
	const isProduction = process.env.NODE_ENV === 'production'
	const connectSources = isProduction
		? "'self' https://api.maptiler.com https://*.maptiler.com wss:"
		: "'self' http: https: ws: wss:"
	const contentSecurityPolicy = [
		"default-src 'self'",
		"base-uri 'self'",
		`connect-src ${connectSources}`,
		"font-src 'self' data: https://fonts.gstatic.com",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"img-src 'self' data: blob: https://api.maptiler.com https://*.maptiler.com https://*.amazonaws.com https://ui-avatars.com https://randomuser.me",
		"manifest-src 'self'",
		"media-src 'self' blob:",
		"object-src 'none'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"worker-src 'self' blob:",
		...(isProduction ? ['upgrade-insecure-requests'] : []),
	].join('; ')

	res.set({
		'Content-Security-Policy': contentSecurityPolicy,
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': 'same-origin',
		'Origin-Agent-Cluster': '?1',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
	})
	if (isProduction) {
		res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
	}
	if (req.path.startsWith('/api/')) {
		res.set('Cache-Control', 'no-store')
	}
	return next()
}

module.exports = securityHeaders
