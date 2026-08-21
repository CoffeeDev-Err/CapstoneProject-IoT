const isProtectedAccount = (account) => (
	String(account?.role || '').toLowerCase() === 'supervisor'
)

const assertAccountCanBeDeactivated = (account) => {
	if (!isProtectedAccount(account)) return

	const error = new Error('COP/admin accounts cannot be deactivated.')
	error.status = 403
	error.code = 'PROTECTED_ACCOUNT'
	throw error
}

module.exports = {
	assertAccountCanBeDeactivated,
	isProtectedAccount,
}
