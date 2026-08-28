const createDeploymentController = (operationalService) => ({
	getDeployments: async (req, res) => {
		res.json(await operationalService.listDeployments(req.query, req.auth.user))
	},
	getDeployment: async (req, res) => {
		const deployment = await operationalService.getDeployment(req.params.assignmentId, req.auth.user)
		if (!deployment) {
			return res.status(404).json({ success: false, message: 'Deployment not found.' })
		}
		return res.json({ deployment })
	},
	acknowledgeDeployment: async (req, res) => {
		const result = await operationalService.acknowledgeDeployment(
			req.params.assignmentId, req.auth.user.personnelId,
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
			req.params.assignmentId, String(req.body?.status || '').toLowerCase(),
		)
		res.status(result.status).json(result.body)
	},
})

module.exports = createDeploymentController
