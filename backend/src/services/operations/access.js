const isSupervisorActor = (actor) => !actor || actor.role === 'supervisor'

const getOfficerPersonnelId = (actor) => (
	actor?.role === 'officer' ? String(actor.personnelId || '').trim() : ''
)

const taskParticipantFilter = (personnelId) => ({
	$or: [
		{ requestedBy: personnelId },
		{ 'responders.personnelId': personnelId },
	],
})

const taskParticipantIds = (task) => [...new Set([
	task.requestedBy,
	...(task.responders || []).map((responder) => responder.personnelId),
])].filter((personnelId) => personnelId && personnelId !== 'supervisor')

const canOfficerReadTask = (task, personnelId, isOnDuty) => (
	taskParticipantIds(task).includes(personnelId)
	|| (Boolean(isOnDuty) && ['open', 'full'].includes(task.status))
)

module.exports = {
	canOfficerReadTask,
	getOfficerPersonnelId,
	isSupervisorActor,
	taskParticipantFilter,
	taskParticipantIds,
}
