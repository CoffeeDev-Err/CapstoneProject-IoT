const { allowedOrigins } = require('../config/cors')

// Pin the realtime channel to the app's own origin(s) instead of a blanket
// "wss:". Each allowed origin contributes both its http(s) form and its ws(s)
// upgrade so the Socket.IO polling handshake and the WebSocket upgrade are both
// permitted, and nothing else can be abused as an exfiltration channel.
const socketConnectSources = allowedOrigins.flatMap((origin) => {
	const realtimeOrigin = origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
	return realtimeOrigin === origin ? [origin] : [origin, realtimeOrigin]
})

// Only allow the app's own S3 bucket/region for <img>, not every AWS host. The
// media route 302-redirects evidence and profile photos straight to a presigned
// S3 URL, so the browser must be able to load from that specific bucket.
const s3ImageSources = (() => {
	const region = String(process.env.AWS_REGION || '').trim()
	const bucket = String(process.env.AWS_S3_BUCKET || '').trim()
	if (!region || !bucket) return []
	return [
		`https://${bucket}.s3.${region}.amazonaws.com`, // virtual-hosted style
		`https://s3.${region}.amazonaws.com`, // path style
	]
})()

const securityHeaders = (req, res, next) => {
	const isProduction = process.env.NODE_ENV === 'production'
	const connectSources = isProduction
		? [
			"'self'",
			'https://api.maptiler.com',
			'https://*.maptiler.com',
			...socketConnectSources,
		].join(' ')
		: "'self' http: https: ws: wss:"
	const imageSources = [
		"'self'",
		'data:',
		'blob:',
		'https://api.maptiler.com',
		'https://*.maptiler.com',
		'https://ui-avatars.com',
		...s3ImageSources,
	].join(' ')
	const contentSecurityPolicy = [
		"default-src 'self'",
		"base-uri 'self'",
		`connect-src ${connectSources}`,
		"font-src 'self' data: https://fonts.gstatic.com",
		"form-action 'self'",
		"frame-ancestors 'none'",
		`img-src ${imageSources}`,
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
