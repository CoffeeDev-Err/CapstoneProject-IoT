const {
	deleteStoredMedia,
	storeUploadedMedia,
} = require('../../services/mediaStorageService')

const createReportController = (operationalService, mediaStorage = {
	deleteStoredMedia,
	storeUploadedMedia,
}) => ({
	getReports: async (req, res) => {
		res.json(await operationalService.listReports(req.query, req.auth.user))
	},
	getReport: async (req, res) => {
		const report = await operationalService.getReport(req.params.reportId, req.auth.user)
		if (!report) return res.status(404).json({ success: false, message: 'Report not found.' })
		return res.json({ report })
	},
	getReportRoute: async (req, res) => {
		const route = await operationalService.getReportRoute(req.params.reportId)
		if (!route) return res.status(404).json({ success: false, message: 'Report not found.' })
		return res.json({ route })
	},
	submitReport: async (req, res) => {
		let storedEvidence
		try {
			const existingReport = await operationalService.getReportByClientSubmissionId(
				req.auth.user.personnelId, req.body.client_submission_id,
			)
			if (existingReport) {
				return res.status(200).json({ success: true, report: existingReport, duplicate: true })
			}
			storedEvidence = req.file
				? await mediaStorage.storeUploadedMedia(req.file, 'report-evidence')
				: undefined
			const { evidence_photo: _clientEvidence, ...reportInput } = req.body
			const report = await operationalService.submitReport({
				...reportInput,
				personnel_id: req.auth.user.personnelId,
				...(req.file && storedEvidence && {
					evidence_photo: {
						path: storedEvidence,
						originalName: req.file.originalname,
						mimeType: req.file.mimetype,
						size: req.file.size,
						cameraFacing: req.body.evidence_camera_facing === 'front' ? 'front' : 'back',
						capturedAt: req.body.evidence_captured_at || new Date(),
					},
				}),
			})
			return res.status(201).json({ success: true, report })
		} catch (error) {
			if (storedEvidence) await mediaStorage.deleteStoredMedia(storedEvidence).catch(() => {})
			throw error
		}
	},
	resolveReport: async (req, res) => {
		const result = await operationalService.resolveReport(req.params.reportId, {
			...req.body, resolved_by: req.auth.user.personnelId,
		})
		res.status(result.status).json(result.body)
	},
	updateReportValidation: async (req, res) => {
		const result = await operationalService.updateReportValidation(req.params.reportId, req.body)
		res.status(result.status).json(result.body)
	},
})

module.exports = createReportController
