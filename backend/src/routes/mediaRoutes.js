const express = require('express')
const { pipeline } = require('node:stream/promises')
const asyncHandler = require('../middleware/asyncHandler')
const {
	createPresignedDownloadUrl,
	verifyMediaAccess,
	readStoredS3Media,
} = require('../services/mediaStorageService')

const createMediaRoutes = () => {
	const router = express.Router()

	router.get('/:token', asyncHandler(async (req, res) => {
		const download = req.query.download === '1'
		const media = verifyMediaAccess({
			token: req.params.token,
			expires: req.query.expires,
			signature: req.query.signature,
		})
		// Signed media URLs are intentionally usable by the separately hosted web
		// frontend. Keep the rest of the API same-origin via securityHeaders.
		res.set({
			'Cache-Control': 'private, no-store',
			'Cross-Origin-Resource-Policy': 'cross-origin',
		})
		if (media.storage === 'local') {
			if (download) res.attachment(media.key.split('/').at(-1))
			return res.sendFile(media.absolutePath, {
				dotfiles: 'deny',
			})
		}
		// PDF generation needs image bytes from our origin, not an S3 redirect.
		// The same expiring signature above protects both delivery modes.
		if (req.query.export === '1') {
			const object = await readStoredS3Media(media.key)
			res.type(object.ContentType || 'application/octet-stream')
			if (object.ContentLength != null) res.set('Content-Length', String(object.ContentLength))
			await pipeline(object.Body, res)
			return
		}
		const url = await createPresignedDownloadUrl(media.key, { download })
		return res.redirect(302, url)
	}))

	return router
}

module.exports = createMediaRoutes
