const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Readable } = require('node:stream')
const express = require('express')
const request = require('supertest')
const storage = require('../src/services/mediaStorageService')

test('signed export streams S3 bytes and rejects invalid signatures before reading S3', async () => {
	process.env.MEDIA_URL_SIGNING_SECRET = 'media-export-test-secret'
	process.env.AWS_REGION = 'ap-southeast-1'
	process.env.AWS_S3_BUCKET = 'test-bucket'
	process.env.AWS_ACCESS_KEY_ID = 'test'
	process.env.AWS_SECRET_ACCESS_KEY = 'test'
	let reads = 0
	const original = storage.readStoredS3Media
	storage.readStoredS3Media = async (key) => {
		reads += 1
		assert.equal(key, 'report-evidence/photo.jpg')
		return { Body: Readable.from([Buffer.from('photo-bytes')]), ContentType: 'image/jpeg', ContentLength: 11 }
	}
	try {
		const app = express()
		app.use('/api/media', require('../src/routes/mediaRoutes')())
		app.use((error, req, res, next) => {
			void req
			void next
			res.status(error.status || 500).json({ error: error.code })
		})
		const url = storage.toMediaAccessPath('s3://test-bucket/report-evidence/photo.jpg')
		const result = await request(app).get(`${url}&export=1`).expect(200)
		assert.equal(result.headers.location, undefined)
		assert.equal(result.headers['content-type'], 'image/jpeg')
		assert.equal(result.body.toString(), 'photo-bytes')
		await request(app).get(`${url.replace(/signature=[^&]+/, 'signature=invalid')}&export=1`).expect(403)
		assert.equal(reads, 1)
		await request(app).get(url).expect(302)
		assert.equal(reads, 1)
	} finally {
		storage.readStoredS3Media = original
	}
})
