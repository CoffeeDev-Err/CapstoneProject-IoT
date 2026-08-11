const path = require('path')

const defaultUploadRoot = path.resolve(__dirname, '../../uploads')
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || defaultUploadRoot)

const getUploadDirectory = (...segments) => path.join(uploadRoot, ...segments)

module.exports = {
	getUploadDirectory,
	uploadRoot,
}
