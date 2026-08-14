const {
	deleteStoredMedia,
	storeUploadedMedia,
} = require('../services/mediaStorageService')

const createAccountController = (accountService) => ({
	getAccounts: async (_req, res) => {
		res.json({ accounts: await accountService.loadAccounts() })
	},

	createAccount: async (req, res) => {
		let storedPhoto
		try {
			storedPhoto = req.file
				? await storeUploadedMedia(req.file, 'profile-photos')
				: undefined
			const account = await accountService.createAccount({
				...req.body,
				...(storedPhoto ? { photoUrl: storedPhoto } : {}),
			}, {
				ipAddress: req.ip,
			})
			return res.status(201).json({ success: true, account })
		} catch (error) {
			if (storedPhoto) await deleteStoredMedia(storedPhoto).catch(() => {})
			throw error
		}
	},

	updateAccount: async (req, res) => {
		let storedPhoto
		const previousPhoto = req.file
			? await accountService.getAccountPhotoReference(req.params.accountId)
			: undefined
		try {
			storedPhoto = req.file
				? await storeUploadedMedia(req.file, 'profile-photos')
				: undefined
			const account = await accountService.updateAccount(
				req.params.accountId,
				{
					...req.body,
					...(storedPhoto ? { photoUrl: storedPhoto } : {}),
				},
				{ ipAddress: req.ip },
			)
			if (storedPhoto && previousPhoto && previousPhoto !== storedPhoto) {
				await deleteStoredMedia(previousPhoto).catch((error) => {
					console.error('Previous profile photo cleanup failed:', error.message)
				})
			}
			return res.json({ success: true, account })
		} catch (error) {
			if (storedPhoto) await deleteStoredMedia(storedPhoto).catch(() => {})
			throw error
		}
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
