const {
	deleteStoredMedia,
	storeUploadedMedia,
} = require('../services/mediaStorageService')

const createOperationalController = (operationalService) => ({
	getTasks: async (req, res) => {
		res.json(await operationalService.listTasks(req.query, req.auth.user))
	},

	getTask: async (req, res) => {
		const task = await operationalService.getTask(req.params.taskId, req.auth.user)
		if (!task) {
			return res.status(404).json({ success: false, message: 'Task not found.' })
		}
		return res.json({ task })
	},

	getBootstrap: async (req, res) => {
		const personnelId = req.auth.user.personnelId
		const [taskPayload, deployments, upcomingDeployment] = await Promise.all([
			operationalService.listTasks({ view: 'active', limit: 100 }, req.auth.user),
			operationalService.loadDeployments(personnelId),
			operationalService.getUpcomingDeployment(personnelId),
		])
		res.json({
			tasks: taskPayload.data,
			reports: [],
			deployments,
			upcomingDeployment,
		})
	},

	createTask: async (req, res) => {
		const task = await operationalService.createTask({
			...req.body,
			type: 'backup',
			requested_by: req.auth.user.personnelId,
		})
		res.status(201).json({ success: true, task })
	},

	acceptTask: async (req, res) => {
		const result = await operationalService.acceptTask(
			req.params.taskId,
			req.auth.user.personnelId,
		)
		res.status(result.status).json(result.body)
	},

	cancelTask: async (req, res) => {
		const result = await operationalService.cancelTask(
			req.params.taskId,
			req.auth.user.personnelId,
		)
		res.status(result.status).json(result.body)
	},

	completeTask: async (req, res) => {
		const result = await operationalService.completeTask(req.params.taskId)
		res.status(result.status).json(result.body)
	},

	getReports: async (req, res) => {
		res.json(await operationalService.listReports(req.query, req.auth.user))
	},

	getReport: async (req, res) => {
		const report = await operationalService.getReport(req.params.reportId, req.auth.user)
		if (!report) {
			return res.status(404).json({ success: false, message: 'Report not found.' })
		}
		return res.json({ report })
	},

	getReportRoute: async (req, res) => {
		const route = await operationalService.getReportRoute(req.params.reportId)
		if (!route) {
			return res.status(404).json({ success: false, message: 'Report not found.' })
		}
		return res.json({ route })
	},

	submitReport: async (req, res) => {
		let storedEvidence
		try {
			const existingReport = await operationalService.getReportByClientSubmissionId(
				req.auth.user.personnelId,
				req.body.client_submission_id,
			)
			if (existingReport) {
				return res.status(200).json({ success: true, report: existingReport, duplicate: true })
			}
			storedEvidence = req.file
				? await storeUploadedMedia(req.file, 'report-evidence')
				: undefined
			// Never trust a client-supplied evidence path; evidence is only ever the
			// file we just stored. Strip any evidence_photo the client sent in the body.
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
						cameraFacing: req.body.evidence_camera_facing === 'front'
							? 'front'
							: 'back',
						capturedAt: req.body.evidence_captured_at || new Date(),
					},
				}),
			})
			return res.status(201).json({ success: true, report })
		} catch (error) {
			if (storedEvidence) await deleteStoredMedia(storedEvidence).catch(() => {})
			throw error
		}
	},

	resolveReport: async (req, res) => {
		const result = await operationalService.resolveReport(
			req.params.reportId,
			{
				...req.body,
				resolved_by: req.auth.user.personnelId,
			},
		)
		res.status(result.status).json(result.body)
	},

	updateReportValidation: async (req, res) => {
		const result = await operationalService.updateReportValidation(
			req.params.reportId,
			req.body,
		)
		res.status(result.status).json(result.body)
	},

	getDeployments: async (req, res) => {
		res.json(await operationalService.listDeployments(req.query, req.auth.user))
	},

	getDeployment: async (req, res) => {
		const deployment = await operationalService.getDeployment(
			req.params.assignmentId,
			req.auth.user,
		)
		if (!deployment) {
			return res.status(404).json({
				success: false,
				message: 'Deployment not found.',
			})
		}
		return res.json({ deployment })
	},

	acknowledgeDeployment: async (req, res) => {
		const result = await operationalService.acknowledgeDeployment(
			req.params.assignmentId,
			req.auth.user.personnelId,
		)
		res.status(result.status).json(result.body)
	},

	replaceDeployments: async (req, res) => {
		if (!Array.isArray(req.body?.assignments)) {
			const error = new Error('assignments must be an array.')
			error.status = 400
			error.code = 'INVALID_DEPLOYMENT_PAYLOAD'
			throw error
		}
		const deployments = await operationalService.replaceDeployments(req.body.assignments)
		res.json({ success: true, deployments })
	},

	updateDeploymentStatus: async (req, res) => {
		const result = await operationalService.updateDeploymentStatus(
			req.params.assignmentId,
			String(req.body?.status || '').toLowerCase(),
		)
		res.status(result.status).json(result.body)
	},
})

module.exports = createOperationalController
