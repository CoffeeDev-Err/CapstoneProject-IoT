const createAuthenticateSession = (authService) => async (req, _res, next) => {
	try {
		const authorization = String(req.get('authorization') || '')
		const token = authorization.startsWith('Bearer ')
			? authorization.slice(7).trim()
			: ''
		req.auth = await authService.authenticate(token)
		next()
	} catch (error) {
		next(error)
	}
}

module.exports = createAuthenticateSession
