const createAccountController = (accountService) => ({
	getAccounts: async (_req, res) => {
		res.json({ accounts: await accountService.loadAccounts() })
	},

	createAccount: async (req, res) => {
		const account = await accountService.createAccount(req.body, {
			ipAddress: req.ip,
		})
		res.status(201).json({ success: true, account })
	},

	updateAccount: async (req, res) => {
		const account = await accountService.updateAccount(
			req.params.accountId,
			req.body,
			{ ipAddress: req.ip },
		)
		res.json({ success: true, account })
	},

	deactivateAccount: async (req, res) => {
		const result = await accountService.deactivateAccount(
			req.params.accountId,
			{ ipAddress: req.ip },
		)
		res.json({ success: true, message: result.message })
	},
})

module.exports = createAccountController
