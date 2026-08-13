const securityHeaders = (req, res, next) => {
	res.set({
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
	})
	if (req.path.startsWith('/api/')) {
		res.set('Cache-Control', 'no-store')
	}
	return next()
}

module.exports = securityHeaders
