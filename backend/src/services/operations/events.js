const emitDeploymentCollection = ({
	io,
	eventName,
	deployments,
	affectedPersonnelIds = [],
}) => {
	io.to('role:supervisor').emit(eventName, deployments)
	const personnelIds = [...new Set([
		...deployments.map((deployment) => deployment.personnelId),
		...affectedPersonnelIds,
	].map((personnelId) => String(personnelId || '').trim()).filter(Boolean))]
	for (const personnelId of personnelIds) {
		io.to(`personnel:${personnelId}`).emit(
			eventName,
			deployments.filter((deployment) => deployment.personnelId === personnelId),
		)
	}
}

const emitTaskRemoval = ({ io, taskId, personnelIds = [] }) => {
	const recipients = [...new Set(
		personnelIds.map((personnelId) => String(personnelId || '').trim()).filter(Boolean),
	)]
	for (const personnelId of recipients) {
		io.to(`personnel:${personnelId}`).emit('task:removed', { id: taskId })
	}
}

const createOperationalPublisher = (io) => ({
	emitToSupervisorAndPersonnel: (eventName, payload, personnelId) => {
		io.to('role:supervisor').emit(eventName, payload)
		if (personnelId) io.to(`personnel:${personnelId}`).emit(eventName, payload)
	},
	emitDeploymentCollection: (input) => emitDeploymentCollection({ io, ...input }),
	emitTaskRemoval: (input) => emitTaskRemoval({ io, ...input }),
})

module.exports = {
	createOperationalPublisher,
	emitDeploymentCollection,
	emitTaskRemoval,
}
