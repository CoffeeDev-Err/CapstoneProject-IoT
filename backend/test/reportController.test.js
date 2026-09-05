const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createReportController = require('../src/controllers/operations/reportController')

const createResponse = () => ({
	statusCode: 200,
	body: undefined,
	status(code) {
		this.statusCode = code
		return this
	},
	json(body) {
		this.body = body
		return this
	},
})

describe('report controller', () => {
	it('reconciles concurrent retries after a submission-ID uniqueness conflict', async () => {
		let lookups = 0
		const deleted = []
		const existingReport = { id: 'RPT-WINNER' }
		const controller = createReportController({
			getReportByClientSubmissionId: async () => ++lookups === 1 ? null : existingReport,
			submitReport: async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }) },
		}, {
			storeUploadedMedia: async () => 'losing-upload.jpg',
			deleteStoredMedia: async (path) => deleted.push(path),
		})
		const res = createResponse()
		await controller.submitReport({ auth: { user: { personnelId: 'PNP-001' } },
			body: { client_submission_id: 'mobile-retry' }, file: { originalname: 'photo.jpg' },
		}, res)
		assert.equal(res.statusCode, 200)
		assert.equal(res.body.duplicate, true)
		assert.deepEqual(deleted, ['losing-upload.jpg'])
	})
	it('returns an idempotent submission before storing duplicate evidence', async () => {
		let storeCalls = 0
		const existingReport = { id: 'RPT-2026-DUPLICATE' }
		const controller = createReportController({
			getReportByClientSubmissionId: async () => existingReport,
		}, {
			storeUploadedMedia: async () => {
				storeCalls += 1
			},
			deleteStoredMedia: async () => {},
		})
		const req = {
			auth: { user: { personnelId: 'PNP-001' } },
			body: { client_submission_id: 'mobile-duplicate-1234' },
			file: { originalname: 'evidence.jpg' },
		}
		const res = createResponse()

		await controller.submitReport(req, res)

		assert.equal(res.statusCode, 200)
		assert.deepEqual(res.body, { success: true, report: existingReport, duplicate: true })
		assert.equal(storeCalls, 0)
	})

	it('deletes stored evidence when report creation fails', async () => {
		const deleted = []
		const controller = createReportController({
			getReportByClientSubmissionId: async () => null,
			submitReport: async () => {
				throw new Error('database unavailable')
			},
		}, {
			storeUploadedMedia: async () => 'report-evidence/stored.jpg',
			deleteStoredMedia: async (path) => deleted.push(path),
		})
		const req = {
			auth: { user: { personnelId: 'PNP-001' } },
			body: { client_submission_id: 'mobile-cleanup-1234' },
			file: {
				originalname: 'evidence.jpg', mimetype: 'image/jpeg', size: 42,
			},
		}

		await assert.rejects(
			controller.submitReport(req, createResponse()),
			/database unavailable/,
		)
		assert.deepEqual(deleted, ['report-evidence/stored.jpg'])
	})
})
