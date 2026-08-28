const {
	CurrentLocation,
	Deployment,
	LocationHistory,
	Personnel,
	Report,
	Task,
} = require('../models')
const {
	emitPersonnelCollection,
	getPersonnelMember,
	getPersonnelWithLocations,
} = require('./personnelService')
const { createNotification, deliverNotification } = require('./notificationService')
const {
	canOfficerReadTask,
	getOfficerPersonnelId,
	taskParticipantIds,
} = require('./operations/access')
const { createPersonnelLoader } = require('./operations/pagination')
const {
	createOperationalPublisher,
	emitDeploymentCollection,
	emitTaskRemoval,
} = require('./operations/events')
const createDeploymentService = require('./operations/deploymentService')
const createReportRouteService = require('./operations/reportRouteService')
const createReportService = require('./operations/reportService')
const createTaskService = require('./operations/taskService')

const loadPersonnelMap = createPersonnelLoader(Personnel)

const createOperationalService = ({ io }) => {
	const operationalPublisher = createOperationalPublisher(io)
	const reportRouteService = createReportRouteService({ Report, LocationHistory })
	const finalizeReportRouteSnapshots = reportRouteService.finalizeSnapshots
	const getReportRoute = reportRouteService.getRoute
	const taskService = createTaskService({
		io,
		models: { Deployment, Task },
		loadPersonnelMap,
		personnelService: { getPersonnelMember },
		notificationService: { createNotification, deliverNotification },
	})
	const {
		acceptTask,
		cancelTask,
		completeTask,
		createTask,
		getTask,
		listTasks,
		loadTasks,
	} = taskService
	const reportService = createReportService({
		io,
		models: { CurrentLocation, Deployment, Report },
		loadPersonnelMap,
		personnelService: { getPersonnelMember },
		notificationService: { createNotification, deliverNotification },
		reportRouteService,
		publish: operationalPublisher,
	})
	const {
		getReport,
		getReportByClientSubmissionId,
		listReports,
		loadReports,
		resolveReport,
		submitReport,
		updateReportValidation,
	} = reportService
	const deploymentService = createDeploymentService({
		io,
		models: { Deployment, Personnel },
		loadPersonnelMap,
		personnelService: { emitPersonnelCollection, getPersonnelWithLocations },
		notificationService: { createNotification, deliverNotification },
		publish: operationalPublisher,
	})
	const {
		acknowledgeDeployment,
		getDeployment,
		getUpcomingDeployment,
		listDeployments,
		loadDeployments,
		reconcileDeploymentShifts,
		replaceDeployments,
		updateDeploymentStatus,
	} = deploymentService

	const registerSocket = async (socket, actor) => {
		const [taskPayload, deployments] = await Promise.all([
			listTasks({ view: 'active', limit: 100 }, actor),
			loadDeployments(getOfficerPersonnelId(actor) || undefined),
		])
		socket.emit('tasks:bootstrap', taskPayload.data)
		socket.emit('deployments:bootstrap', deployments)
	}

	return {
		acceptTask,
		acknowledgeDeployment,
		cancelTask,
		completeTask,
		createTask,
		getDeployment,
		getUpcomingDeployment,
		getReport,
		getReportByClientSubmissionId,
		getReportRoute,
		getTask,
		listDeployments,
		listReports,
		listTasks,
		loadDeployments,
		loadReports,
		loadTasks,
		registerSocket,
		reconcileDeploymentShifts,
		replaceDeployments,
		resolveReport,
		submitReport,
		updateDeploymentStatus,
		updateReportValidation,
		finalizeReportRouteSnapshots,
	}
}

module.exports = createOperationalService
module.exports.canOfficerReadTask = canOfficerReadTask
module.exports.emitDeploymentCollection = emitDeploymentCollection
module.exports.emitTaskRemoval = emitTaskRemoval
module.exports.taskParticipantIds = taskParticipantIds
