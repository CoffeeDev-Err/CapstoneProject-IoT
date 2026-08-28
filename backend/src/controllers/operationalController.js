const createDeploymentController = require('./operations/deploymentController')
const createReportController = require('./operations/reportController')
const createTaskController = require('./operations/taskController')

const createOperationalController = (operationalService) => ({
	...createTaskController(operationalService),
	...createReportController(operationalService),
	...createDeploymentController(operationalService),
})

module.exports = createOperationalController
