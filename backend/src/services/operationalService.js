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

const createOperationalService = ({ io, auditService }) => {
	const operationalPublisher = createOperationalPublisher(io)
	const reportRouteService = createReportRouteService({ Report, LocationHistory })
	const finalizeReportRouteSnapshots = reportRouteService.finalizeSnapshots
	const getReportRoute = reportRouteService.getRoute
	const taskService = createTaskService({
		io,
		models: { CurrentLocation, Deployment, Task },
		loadPersonnelMap,
		personnelService: { getPersonnelMember },
		notificationService: { createNotification, deliverNotification },
		auditService,
	})
	const {
		acceptTask,
		cancelTask,
		completeTask,
		createTask,
		deactivatePersonnelTasks,
		getTask,
		listTasks,
		loadTasks,
		reconcileTaskArrivals,
	} = taskService
	const reportService = createReportService({
		io,
		models: { CurrentLocation, Deployment, Report, Task },
		loadPersonnelMap,
		personnelService: { getPersonnelMember },
		notificationService: { createNotification, deliverNotification },
		auditService,
		reportRouteService,
		publish: operationalPublisher,
	})
	const {
		getReport,
		editReport,
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
		auditService,
		publish: operationalPublisher,
	})
	const {
		acknowledgeDeployment,
		deactivatePersonnelDeployments,
		getDeployment,
		getUpcomingDeployment,
		listDeployments,
		loadDeployments,
		reconcileDeploymentShifts,
		replaceDeployments,
		updateDeploymentStatus,
	} = deploymentService

	const deactivatePersonnelOperations = async (personnelId, { actor } = {}) => {
		const [taskResult, deploymentResult] = await Promise.all([
			deactivatePersonnelTasks(personnelId, actor),
			deactivatePersonnelDeployments(personnelId, actor),
		])
		return { ...taskResult, deploymentsCancelled: deploymentResult.cancelled }
	}

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
		deactivatePersonnelOperations,
		getDeployment,
		getUpcomingDeployment,
		getReport,
		editReport,
		getReportByClientSubmissionId,
		getReportRoute,
		getTask,
		listDeployments,
		listReports,
		listTasks,
		loadDeployments,
		loadReports,
		loadTasks,
		reconcileTaskArrivals,
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
