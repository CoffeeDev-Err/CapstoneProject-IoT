const isProtectedAccount = (account) => (
	String(account?.role || '').toLowerCase() === 'supervisor'
	&& account?.supervisorAuthority === 'primary'
)

const assertCanManageSupervisor = (actor) => {
	if (actor?.role === 'supervisor' && actor?.supervisorAuthority === 'primary') return
	const error = new Error('Only the primary supervisor can manage supervisor accounts.')
	error.status = 403
	error.code = 'PRIMARY_SUPERVISOR_REQUIRED'
	throw error
}

const assertAccountCanBeDeactivated = (account) => {
	if (!isProtectedAccount(account)) return

	const error = new Error('COP/admin accounts cannot be deactivated.')
	error.status = 403
	error.code = 'PROTECTED_ACCOUNT'
	throw error
}

module.exports = {
	assertAccountCanBeDeactivated,
	assertCanManageSupervisor,
	isProtectedAccount,
}
