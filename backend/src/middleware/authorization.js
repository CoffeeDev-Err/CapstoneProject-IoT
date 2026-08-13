const createAuthenticateSession = require('./authenticateSession')

const createAuthorization = (authService) => {
	const authenticate = createAuthenticateSession(authService)
	const requireRole = (...roles) => (req, _res, next) => {
		if (!roles.includes(req.auth?.user?.role)) {
			const error = new Error(`${roles.join(' or ')} access is required.`)
			error.status = 403
			error.code = 'ROLE_REQUIRED'
			return next(error)
		}
		return next()
	}

	return {
		authenticate,
		officerOnly: [authenticate, requireRole('officer')],
		requireRole,
		supervisorOnly: [authenticate, requireRole('supervisor')],
	}
}

module.exports = createAuthorization
