const { randomUUID } = require('crypto')
const fs = require('fs')
const multer = require('multer')
const { getUploadDirectory } = require('../config/uploads')

const uploadDirectory = getUploadDirectory('report-evidence')
fs.mkdirSync(uploadDirectory, { recursive: true })

const extensionByMimeType = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
}

const upload = multer({
	storage: multer.diskStorage({
		destination: uploadDirectory,
		filename: (_req, file, callback) => {
			const extension = extensionByMimeType[file.mimetype] || '.jpg'
			callback(null, `${randomUUID()}${extension}`)
		},
	}),
	limits: {
		fileSize: 5 * 1024 * 1024,
		files: 1,
	},
	fileFilter: (_req, file, callback) => {
		if (!extensionByMimeType[file.mimetype]) {
			const error = new Error('Photo evidence must be a JPEG, PNG, or WebP image.')
			error.status = 400
			return callback(error)
		}
		return callback(null, true)
	},
})

const uploadReportEvidence = (req, _res, next) => {
	upload.single('evidence_photo')(req, _res, (error) => {
		if (!error) return next()

		if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
			error.message = 'Photo evidence must be 5 MB or smaller.'
		}
		error.status = error.status || 400
		return next(error)
	})
}

module.exports = uploadReportEvidence
