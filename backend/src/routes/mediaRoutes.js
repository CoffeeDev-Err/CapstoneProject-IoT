const express = require('express')
const asyncHandler = require('../middleware/asyncHandler')
const {
	createPresignedDownloadUrl,
	verifyMediaAccess,
} = require('../services/mediaStorageService')

const createMediaRoutes = () => {
	const router = express.Router()

	router.get('/:token', asyncHandler(async (req, res) => {
		const media = verifyMediaAccess({
			token: req.params.token,
			expires: req.query.expires,
			signature: req.query.signature,
		})
		res.set('Cache-Control', 'private, no-store')
		if (media.storage === 'local') {
			return res.sendFile(media.absolutePath, {
				dotfiles: 'deny',
			})
		}
		const url = await createPresignedDownloadUrl(media.key)
		return res.redirect(302, url)
	}))

	return router
}

module.exports = createMediaRoutes
