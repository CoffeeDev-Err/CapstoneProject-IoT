const createOperationalController = (operationalService) => ({
	getTasks: async (req, res) => {
		res.json(await operationalService.listTasks(req.query))
	},

	getTask: async (req, res) => {
		const task = await operationalService.getTask(req.params.taskId)
		if (!task) {
			return res.status(404).json({ success: false, message: 'Task not found.' })
		}
		return res.json({ task })
	},

	getBootstrap: async (req, res) => {
		const personnelId = String(req.query.personnel_id || '')
		const [tasks, reports, deployments] = await Promise.all([
			operationalService.loadTasks(),
			operationalService.loadReports(personnelId),
			operationalService.loadDeployments(personnelId),
		])
		res.json({ tasks, reports, deployments })
	},

	createTask: async (req, res) => {
		const task = await operationalService.createTask(req.body)
		res.status(201).json({ success: true, task })
	},

	acceptTask: async (req, res) => {
		const result = await operationalService.acceptTask(
			req.params.taskId,
			req.body?.personnel_id,
		)
		res.status(result.status).json(result.body)
	},

	completeTask: async (req, res) => {
		const result = await operationalService.completeTask(req.params.taskId, req.body)
		res.status(result.status).json(result.body)
	},

	getReports: async (req, res) => {
		res.json(await operationalService.listReports(req.query))
	},

	getReport: async (req, res) => {
		const report = await operationalService.getReport(req.params.reportId)
		if (!report) {
			return res.status(404).json({ success: false, message: 'Report not found.' })
		}
		return res.json({ report })
	},

	submitReport: async (req, res) => {
		const report = await operationalService.submitReport(req.body)
		res.status(201).json({ success: true, report })
	},

	resolveReport: async (req, res) => {
		const result = await operationalService.resolveReport(
			req.params.reportId,
			req.body,
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
		res.json(await operationalService.listDeployments(req.query))
	},

	getDeployment: async (req, res) => {
		const deployment = await operationalService.getDeployment(req.params.assignmentId)
		if (!deployment) {
			return res.status(404).json({
				success: false,
				message: 'Deployment not found.',
			})
		}
		return res.json({ deployment })
	},

	replaceDeployments: async (req, res) => {
		const assignments = Array.isArray(req.body?.assignments)
			? req.body.assignments
			: []
		const deployments = await operationalService.replaceDeployments(assignments)
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
