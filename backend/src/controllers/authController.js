const createAuthController = (authService) => ({
	login: async (req, res) => {
		res.json(await authService.login(req.body))
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
})

module.exports = createAuthController
