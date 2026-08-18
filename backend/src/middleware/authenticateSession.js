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
		next()
	} catch (error) {
		next(error)
	}
}

module.exports = createAuthenticateSession
