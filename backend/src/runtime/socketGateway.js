const registerSocketGateway = ({
	io,
	authService,
	operationalService,
	personnelService,
	readSessionCookie,
	logger = console,
}) => {
	const { getPersonnelWithLocations, scopePersonnelForActor } = personnelService

	io.use(async (socket, next) => {
		const bearerToken = String(socket.handshake.auth?.token || '')
		const token = bearerToken || readSessionCookie(socket.handshake.headers?.cookie)
		try {
			socket.data.auth = await authService.authenticate(token)
			return next()
		} catch (error) {
			return next(error)
		}
	})

	io.on('connection', async (socket) => {
		try {
			const personnelId = socket.data.auth?.user?.personnelId
			if (personnelId) socket.join(`personnel:${personnelId}`)
			const role = socket.data.auth?.user?.role
			if (role) socket.join(`role:${role}`)
			if (String(socket.handshake.auth?.bootstrapMode || '') !== 'rest') {
				const personnel = await getPersonnelWithLocations()
				socket.emit(
					'personnel:bootstrap',
					scopePersonnelForActor(personnel, socket.data.auth?.user),
				)
				await operationalService.registerSocket(socket, socket.data.auth?.user)
			}
		} catch (error) {
			logger.error('Socket bootstrap failed:', error)
		}
	})
}

module.exports = registerSocketGateway
