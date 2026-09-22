const { readSessionCookie } = require('../config/authCookie')

const createAuthenticateSession = (authService) => async (req, _res, next) => {
	try {
		const authorization = String(req.get('authorization') || '')
		const bearerToken = authorization.startsWith('Bearer ')
			? authorization.slice(7).trim()
			: ''
		// Officers (mobile) send a Bearer token; supervisors (web) send the
		// httpOnly session cookie. Bearer wins when both are present.
		const token = bearerToken || readSessionCookie(req.headers.cookie)
		req.auth = await authService.authenticate(token)
		if (req.auth?.user?.forcePasswordReset) {
			const allowedAuthPaths = new Set([
				'/me',
				'/logout',
				'/password/change/request',
				'/password',
			])
			if (req.baseUrl !== '/api/auth' || !allowedAuthPaths.has(req.path)) {
				const error = new Error('Change your temporary password before using GeoSentri.')
				error.status = 403
				error.code = 'PASSWORD_CHANGE_REQUIRED'
				return next(error)
			}
		}
		next()
	} catch (error) {
		next(error)
	}
}

module.exports = createAuthenticateSession
