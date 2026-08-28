const registerSocketGateway = ({
	io,
	authService,
	operationalService,
	personnelService,
	readSessionCookie,
	logger = console,
}) => {
	const { getPersonnelMember, getPersonnelWithLocations, scopePersonnelForActor } = personnelService

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

		socket.on('emergency:request', async ({ id } = {}) => {
			try {
				const requestingUser = socket.data.auth?.user
				if (requestingUser?.role === 'officer' && requestingUser.personnelId !== id) {
					socket.emit('emergency:status', {
						success: false,
						message: 'Backup can only be requested for your assigned profile.',
					})
					return
				}
				const member = await getPersonnelMember(id)
				if (!member) {
					socket.emit('emergency:status', { success: false, message: 'Personnel not found.' })
					return
				}
				io.to('role:supervisor').emit('emergency:alert', {
					id: member.id,
					name: member.name,
					rank: member.rank,
					locationName: member.locationName,
					latitude: member.latitude,
					longitude: member.longitude,
					timestamp: new Date().toISOString(),
					message: `${member.rank} ${member.name} requested backup.`,
				})
				await operationalService.createTask({
					type: 'backup',
					requested_by: member.id,
					requester_name: member.name,
					title: `Backup requested by ${member.name}`,
					description: 'Responders are needed at the officer current location.',
					location: member.locationName,
					latitude: member.latitude,
					longitude: member.longitude,
					required_responders: 3,
				})
				socket.emit('emergency:status', {
					success: true,
					message: 'Backup request has been sent.',
				})
			} catch (error) {
				logger.error('Emergency request failed:', error)
				socket.emit('emergency:status', {
					success: false,
					message: 'Backup request could not be saved.',
				})
			}
		})
	})
}

module.exports = registerSocketGateway
