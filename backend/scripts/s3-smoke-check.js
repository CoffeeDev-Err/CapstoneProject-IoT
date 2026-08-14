require('dotenv').config({ quiet: true })

const assert = require('assert/strict')
const { randomUUID } = require('crypto')
const {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} = require('@aws-sdk/client-s3')

const requiredVariables = [
	'AWS_REGION',
	'AWS_S3_BUCKET',
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_ACCESS_KEY',
]
for (const name of requiredVariables) {
	assert(process.env[name], `${name} is required for the S3 smoke check.`)
}

const client = new S3Client({
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
})
const key = `profile-photos/smoke-check-${randomUUID()}.png`
const body = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
	'base64',
)

const run = async () => {
	let uploaded = false
	try {
		await client.send(new PutObjectCommand({
			Bucket: process.env.AWS_S3_BUCKET,
			Key: key,
			Body: body,
			ContentType: 'image/png',
			ServerSideEncryption: 'AES256',
		}))
		uploaded = true
		const result = await client.send(new GetObjectCommand({
			Bucket: process.env.AWS_S3_BUCKET,
			Key: key,
		}))
		const downloaded = Buffer.from(await result.Body.transformToByteArray())
		assert.deepEqual(downloaded, body, 'Downloaded S3 object did not match the upload.')
		console.log('S3 PutObject/GetObject check passed.')
	} finally {
		if (uploaded) {
			await client.send(new DeleteObjectCommand({
				Bucket: process.env.AWS_S3_BUCKET,
				Key: key,
			}))
			console.log('Temporary S3 smoke-check object deleted.')
		}
	}
}

run().catch((error) => {
	console.error(`S3 smoke check failed: ${error.name || 'Error'}: ${error.message}`)
	process.exitCode = 1
})
