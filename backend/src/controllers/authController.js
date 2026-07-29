const createAuthController = (authService) => ({
	login: async (req, res) => {
		res.json(await authService.login(req.body, { requestIp: req.ip }))
	},

	verifyLogin: async (req, res) => {
		res.json(await authService.verifyLogin(req.body))
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
		res.json({ success: true })
	},

	changePassword: async (req, res) => {
		const user = await authService.changePassword(req.auth.user, req.body)
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
