const fs = require('fs/promises')

const matchesImageSignature = (buffer, mimeType) => {
	if (mimeType === 'image/jpeg') {
		return buffer.length >= 3
			&& buffer[0] === 0xff
			&& buffer[1] === 0xd8
			&& buffer[2] === 0xff
	}
	if (mimeType === 'image/png') {
		return buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
	}
	if (mimeType === 'image/webp') {
		return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
			&& buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	}
	return false
}

const validateUploadedImage = async (req, message) => {
	if (!req.file?.path) return
	let handle
	let isValid = false
	let readError
	try {
		handle = await fs.open(req.file.path, 'r')
		const buffer = Buffer.alloc(12)
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
		isValid = matchesImageSignature(
			buffer.subarray(0, bytesRead),
			req.file.mimetype,
		)
	} catch (error) {
		readError = error
	} finally {
		await handle?.close()
	}
	if (isValid) return

	await fs.unlink(req.file.path).catch(() => {})
	req.file = undefined
	if (readError) throw readError
	const error = new Error(message)
	error.status = 400
	error.code = 'INVALID_IMAGE_CONTENT'
	throw error
}

module.exports = validateUploadedImage
