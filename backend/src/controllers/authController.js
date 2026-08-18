const {
	AUTH_COOKIE_NAME,
	sessionCookieOptions,
	clearCookieOptions,
} = require('../config/authCookie')

const createAuthController = (authService) => ({
	login: async (req, res) => {
		res.json(await authService.login(req.body, { requestIp: req.ip }))
	},

	verifyLogin: async (req, res) => {
		const session = await authService.verifyLogin(req.body)
		// Supervisors use the web dashboard: hand the session token to the
		// browser as an httpOnly cookie (never in the JSON body) so JavaScript —
		// and therefore any XSS — can never read it. Officers use the mobile app,
		// which stores the Bearer token returned in the body in secure storage.
		if (session?.user?.role === 'supervisor') {
			res.cookie(AUTH_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt))
			const { token: _token, ...webSession } = session
			return res.json(webSession)
		}
		return res.json(session)
	},

	resendVerification: async (req, res) => {
		res.json(await authService.resendVerification(
			req.body,
			{ requestIp: req.ip },
		))
	},

	requestPasswordReset: async (req, res) => {
		res.json(await authService.requestPasswordReset(
			req.body,
			{ requestIp: req.ip },
		))
	},

	resetPassword: async (req, res) => {
		res.json(await authService.resetPassword(req.body))
	},

	getCurrentUser: async (req, res) => {
		res.json({ user: await authService.getCurrentUser(req.auth.user) })
	},

	logout: async (req, res) => {
		await authService.logout(req.auth.session)
		res.clearCookie(AUTH_COOKIE_NAME, clearCookieOptions())
		res.json({ success: true })
	},

	changePassword: async (req, res) => {
		const user = await authService.changePassword(req.auth.user, req.body)
		// changePassword revokes every session, so drop the now-dead web cookie.
		res.clearCookie(AUTH_COOKIE_NAME, clearCookieOptions())
		res.json({ success: true, user })
	},

	requestPasswordChange: async (req, res) => {
		res.json(await authService.requestPasswordChange(
			req.auth.user,
			req.body,
			{ requestIp: req.ip },
		))
	},
})

module.exports = createAuthController
