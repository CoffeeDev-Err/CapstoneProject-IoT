const {
	createHmac,
	randomUUID,
	timingSafeEqual,
} = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { getUploadDirectory, uploadRoot } = require('../config/uploads')

const extensionByMimeType = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
}
const allowedPrefixes = new Set(['profile-photos', 'report-evidence'])
const S3_REFERENCE_PATTERN = /^s3:\/\/([^/]+)\/(.+)$/
const LOCAL_REFERENCE_PATTERN = /^\/uploads\/([^/]+)\/(.+)$/
let s3Client
let s3ClientRegion

const createStorageError = (message, code, status = 500) => {
	const error = new Error(message)
	error.code = code
	error.status = status
	return error
}

const getS3Config = () => {
	const config = {
		region: String(process.env.AWS_REGION || '').trim(),
		bucket: String(process.env.AWS_S3_BUCKET || '').trim(),
		accessKeyId: String(process.env.AWS_ACCESS_KEY_ID || '').trim(),
		secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
	}
	const configuredValues = Object.values(config).filter(Boolean).length
	if (configuredValues > 0 && configuredValues < Object.keys(config).length) {
		throw createStorageError(
			'Amazon S3 media storage configuration is incomplete.',
			'S3_CONFIGURATION_INCOMPLETE',
			503,
		)
	}
	return {
		...config,
		enabled: configuredValues === Object.keys(config).length,
	}
}

const getS3Client = () => {
	const config = getS3Config()
	if (!config.enabled) {
		throw createStorageError(
			'Amazon S3 media storage is not configured.',
			'S3_NOT_CONFIGURED',
			503,
		)
	}
	if (!s3Client || s3ClientRegion !== config.region) {
		s3Client = new S3Client({
			region: config.region,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
		})
		s3ClientRegion = config.region
	}
	return { client: s3Client, config }
}

const assertUpload = (file, prefix) => {
	if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
		throw createStorageError('The uploaded image is unavailable.', 'MEDIA_UPLOAD_MISSING', 400)
	}
	if (!allowedPrefixes.has(prefix)) {
		throw createStorageError('The media destination is invalid.', 'MEDIA_PREFIX_INVALID', 400)
	}
	if (!extensionByMimeType[file.mimetype]) {
		throw createStorageError('The uploaded image type is invalid.', 'MEDIA_TYPE_INVALID', 400)
	}
}

const createFilename = (mimeType) => `${randomUUID()}${extensionByMimeType[mimeType]}`

const storeUploadedMedia = async (file, prefix) => {
	assertUpload(file, prefix)
	const filename = createFilename(file.mimetype)
	const config = getS3Config()

	if (!config.enabled) {
		const directory = getUploadDirectory(prefix)
		await fs.mkdir(directory, { recursive: true })
		await fs.writeFile(path.join(directory, filename), file.buffer, { flag: 'wx' })
		return `/uploads/${prefix}/${filename}`
	}

	const key = `${prefix}/${filename}`
	const { client } = getS3Client()
	await client.send(new PutObjectCommand({
		Bucket: config.bucket,
		Key: key,
		Body: file.buffer,
		ContentLength: file.size,
		ContentType: file.mimetype,
		ServerSideEncryption: 'AES256',
	}))
	return `s3://${config.bucket}/${key}`
}

const parseS3Reference = (reference) => {
	const match = String(reference || '').match(S3_REFERENCE_PATTERN)
	if (!match) return null
	return { bucket: match[1], key: match[2] }
}

const parseLocalReference = (reference) => {
	const match = String(reference || '').match(LOCAL_REFERENCE_PATTERN)
	if (!match || !allowedPrefixes.has(match[1])) return null
	if (
		!match[2]
		|| match[2].includes('..')
		|| match[2].includes('/')
		|| match[2].includes('\\')
	) return null
	return {
		prefix: match[1],
		filename: match[2],
	}
}

const deleteLocalMedia = async (reference) => {
	if (!String(reference || '').startsWith('/uploads/')) return false
	const relativePath = String(reference).slice('/uploads/'.length)
	const absolutePath = path.resolve(uploadRoot, relativePath)
	const expectedRoot = `${path.resolve(uploadRoot)}${path.sep}`
	if (!absolutePath.startsWith(expectedRoot)) {
		throw createStorageError('The local media path is invalid.', 'MEDIA_PATH_INVALID', 400)
	}
	await fs.unlink(absolutePath).catch((error) => {
		if (error.code !== 'ENOENT') throw error
	})
	return true
}

const deleteStoredMedia = async (reference) => {
	const parsed = parseS3Reference(reference)
	if (!parsed) return deleteLocalMedia(reference)
	const { client, config } = getS3Client()
	if (parsed.bucket !== config.bucket) {
		throw createStorageError('The S3 media bucket is invalid.', 'S3_BUCKET_MISMATCH', 400)
	}
	await client.send(new DeleteObjectCommand({
		Bucket: parsed.bucket,
		Key: parsed.key,
	}))
	return true
}

const getMediaUrlTtlSeconds = () => {
	const configured = Number(process.env.S3_SIGNED_URL_TTL_SECONDS)
	if (!Number.isFinite(configured)) return 900
	return Math.min(3600, Math.max(60, Math.round(configured)))
}

const getSigningKey = () => {
	const sourceSecret = String(
		process.env.MEDIA_URL_SIGNING_SECRET
		|| process.env.OTP_SECRET
		|| process.env.AWS_SECRET_ACCESS_KEY
		|| '',
	)
	if (!sourceSecret) {
		throw createStorageError(
			'Media URL signing is not configured.',
			'MEDIA_SIGNING_NOT_CONFIGURED',
			503,
		)
	}
	return createHmac('sha256', sourceSecret)
		.update('geosentri-media-url-signing-v1')
		.digest()
}

const signToken = (token, expires) => createHmac('sha256', getSigningKey())
	.update(`${token}.${expires}`)
	.digest('base64url')

const toMediaAccessPath = (reference) => {
	const parsedS3 = parseS3Reference(reference)
	const parsedLocal = parseLocalReference(reference)
	if (!parsedS3 && !parsedLocal) return reference || ''
	if (parsedS3) {
		const config = getS3Config()
		if (!config.enabled || parsedS3.bucket !== config.bucket) return ''
	}
	const mediaReference = parsedS3
		? `s3:${parsedS3.key}`
		: `local:${parsedLocal.prefix}/${parsedLocal.filename}`
	const token = Buffer.from(mediaReference, 'utf8').toString('base64url')
	const now = Math.floor(Date.now() / 1000)
	// Keep the signed URL stable within a minute so frequent GPS/socket updates
	// do not force browsers and native clients to reload the same profile photo.
	const expires = Math.floor(now / 60) * 60 + getMediaUrlTtlSeconds() + 60
	const signature = signToken(token, expires)
	return `/api/media/${token}?expires=${expires}&signature=${signature}`
}

const verifyMediaAccess = ({ token, expires, signature }) => {
	const expiresNumber = Number(expires)
	const now = Math.floor(Date.now() / 1000)
	if (
		!token
		|| !Number.isInteger(expiresNumber)
		|| expiresNumber <= now
		|| expiresNumber > now + getMediaUrlTtlSeconds() + 60
	) {
		throw createStorageError('The media link is invalid or expired.', 'MEDIA_LINK_INVALID', 403)
	}
	const expected = Buffer.from(signToken(token, expiresNumber), 'base64url')
	let received
	try {
		received = Buffer.from(String(signature || ''), 'base64url')
	} catch {
		throw createStorageError('The media link is invalid or expired.', 'MEDIA_LINK_INVALID', 403)
	}
	if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
		throw createStorageError('The media link is invalid or expired.', 'MEDIA_LINK_INVALID', 403)
	}
	const mediaReference = Buffer.from(token, 'base64url').toString('utf8')
	const separatorIndex = mediaReference.indexOf(':')
	const storage = separatorIndex > 0 ? mediaReference.slice(0, separatorIndex) : 's3'
	const key = separatorIndex > 0 ? mediaReference.slice(separatorIndex + 1) : mediaReference
	const [prefix, ...remainingParts] = key.split('/')
	if (
		!['local', 's3'].includes(storage)
		|| !allowedPrefixes.has(prefix)
		|| remainingParts.length !== 1
		|| !remainingParts[0]
		|| key.includes('..')
		|| key.includes('\\')
	) {
		throw createStorageError('The media link is invalid or expired.', 'MEDIA_LINK_INVALID', 403)
	}
	return {
		storage,
		key,
		...(storage === 'local' && {
			absolutePath: path.resolve(uploadRoot, key),
		}),
	}
}

const createPresignedDownloadUrl = async (key, { download = false } = {}) => {
	const { client, config } = getS3Client()
	return getSignedUrl(
		client,
		new GetObjectCommand({
			Bucket: config.bucket,
			Key: key,
			ResponseContentDisposition: download
				? `attachment; filename="${path.basename(key)}"`
				: 'inline',
		}),
		{ expiresIn: 60 },
	)
}

module.exports = {
	createPresignedDownloadUrl,
	deleteStoredMedia,
	parseS3Reference,
	storeUploadedMedia,
	toMediaAccessPath,
	verifyMediaAccess,
}
