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

const hasSavedBackupAudience = (task) => (
	task.type === 'backup' && Array.isArray(task.eligiblePersonnelIds)
)

const isOfficerInTaskAudience = (task, personnelId) => (
	!hasSavedBackupAudience(task) || task.eligiblePersonnelIds.includes(personnelId)
)

const taskOfficerAccessFilter = (personnelId) => ({
	$or: [
		{ requestedBy: personnelId },
		{ 'responders.personnelId': personnelId },
		{ type: { $ne: 'backup' } },
		{ eligiblePersonnelIds: personnelId },
		{ eligiblePersonnelIds: { $exists: false } },
	],
})

const canOfficerReadTask = (task, personnelId, isOnDuty) => (
	taskParticipantIds(task).includes(personnelId)
	|| (Boolean(isOnDuty)
		&& ['open', 'full'].includes(task.status)
		&& isOfficerInTaskAudience(task, personnelId))
)

module.exports = {
	canOfficerReadTask,
	getOfficerPersonnelId,
	isOfficerInTaskAudience,
	isSupervisorActor,
	taskOfficerAccessFilter,
	taskParticipantFilter,
	taskParticipantIds,
}
