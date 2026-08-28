const createTaskController = (operationalService) => ({
	getTasks: async (req, res) => {
		res.json(await operationalService.listTasks(req.query, req.auth.user))
	},
	getTask: async (req, res) => {
		const task = await operationalService.getTask(req.params.taskId, req.auth.user)
		if (!task) return res.status(404).json({ success: false, message: 'Task not found.' })
		return res.json({ task })
	},
	getBootstrap: async (req, res) => {
		const personnelId = req.auth.user.personnelId
		const [taskPayload, deployments, upcomingDeployment] = await Promise.all([
			operationalService.listTasks({ view: 'active', limit: 100 }, req.auth.user),
			operationalService.loadDeployments(personnelId),
			operationalService.getUpcomingDeployment(personnelId),
		])
		res.json({ tasks: taskPayload.data, reports: [], deployments, upcomingDeployment })
	},
	createTask: async (req, res) => {
		const task = await operationalService.createTask({
			...req.body, type: 'backup', requested_by: req.auth.user.personnelId,
		})
		res.status(201).json({ success: true, task })
	},
	acceptTask: async (req, res) => {
		const result = await operationalService.acceptTask(req.params.taskId, req.auth.user.personnelId)
		res.status(result.status).json(result.body)
	},
	cancelTask: async (req, res) => {
		const result = await operationalService.cancelTask(req.params.taskId, req.auth.user.personnelId)
		res.status(result.status).json(result.body)
	},
	completeTask: async (req, res) => {
		const result = await operationalService.completeTask(req.params.taskId)
		res.status(result.status).json(result.body)
	},
})

module.exports = createTaskController
