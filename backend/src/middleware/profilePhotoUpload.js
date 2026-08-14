const multer = require('multer')
const validateUploadedImage = require('./validateUploadedImage')

const extensionByMimeType = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
}

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024,
		files: 1,
	},
	fileFilter: (_req, file, callback) => {
		if (!extensionByMimeType[file.mimetype]) {
			const error = new Error('Profile photo must be a JPEG, PNG, or WebP image.')
			error.status = 400
			return callback(error)
		}
		return callback(null, true)
	},
})

const uploadProfilePhoto = (req, res, next) => {
	upload.single('profile_photo')(req, res, (error) => {
		if (!error) {
			validateUploadedImage(
				req,
				'Profile photo content must be a valid JPEG, PNG, or WebP image.',
			).then(() => next(), next)
			return
		}

		if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
			error.message = 'Profile photo must be 5 MB or smaller.'
		}
		error.status = error.status || 400
		return next(error)
	})
}

module.exports = uploadProfilePhoto
