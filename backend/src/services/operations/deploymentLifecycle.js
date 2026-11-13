const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'ended_early'])

// Keep the planned shift intact. Terminal metadata records what actually happened.
const deploymentTransition = (deployment, requested, now, actor = {}) => {
	if (TERMINAL_STATUSES.has(deployment.status)) {
		return requested === deployment.status
			? { unchanged: true }
			: { error: 'This deployment has ended. Create a new duty instead of reopening it.' }
	}
	const startsAt = deployment.shiftStart ? +new Date(deployment.shiftStart) : -Infinity
	const endsAt = deployment.shiftEnd ? +new Date(deployment.shiftEnd) : Infinity
	if (requested === 'completed' && +now < endsAt) {
		return { error: 'The scheduled shift has not finished. Use End deployment to record an early end.' }
	}
	if (requested === 'ended_early' && +now < startsAt) {
		return { error: 'This duty has not started. Cancel the scheduled deployment instead.' }
	}
	if (requested === 'active' && +now < startsAt) return { error: 'This scheduled duty has not started yet.' }
	if (requested === 'scheduled' && +now >= startsAt) return { error: 'Choose a future shift using the patrol planner.' }
	let status = requested
	if (requested === 'cancelled' && +now >= startsAt) status = +now >= endsAt ? 'completed' : 'ended_early'
	if (requested === 'ended_early' && +now >= endsAt) status = 'completed'
	if (status === deployment.status) return { unchanged: true }
	if (!TERMINAL_STATUSES.has(status)) return { update: { status } }
	return { update: {
		status,
		endedAt: status === 'completed' ? new Date(endsAt) : now,
		endedBy: String(actor.id || actor.username || actor.personnelId || actor.role || 'supervisor').slice(0, 100),
		endReason: status === 'completed' ? 'scheduled_end' : status === 'ended_early' ? 'supervisor_ended' : 'cancelled_before_start',
	} }
}

const deploymentEndNotice = (deployment) => {
	const place = deployment.patrolArea || 'your assigned area'
	if (deployment.status === 'ended_early') return {
		title: 'Deployment ended early',
		message: `Your deployment at ${place} was ended early by your supervisor. This is recorded as an early end, not a completed shift.`,
	}
	if (deployment.status === 'completed') return {
		title: 'Shift completed', message: `Your scheduled shift at ${place} has finished.`,
	}
	if (deployment.status === 'cancelled') return {
		title: 'Scheduled deployment cancelled', message: `Your scheduled deployment at ${place} was cancelled before it started.`,
	}
	return { title: 'Deployment status updated', message: `Your deployment at ${place} is now ${deployment.status}.` }
}

module.exports = { deploymentTransition, deploymentEndNotice }
