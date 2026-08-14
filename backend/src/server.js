require('dotenv').config()

const { validateProductionEnvironment } = require('./config/environment')

validateProductionEnvironment()

const fs = require('fs')
const http = require('http')
const path = require('path')
const express = require('express')
const mongoose = require('mongoose')
const { Server } = require('socket.io')
const app = require('./app')
const { corsOptions } = require('./config/cors')
const connectDB = require('./config/db')
const createAccountController = require('./controllers/accountController')
const createAnalyticsController = require('./controllers/analyticsController')
const createAuditController = require('./controllers/auditController')
const createAuthController = require('./controllers/authController')
const createBarangayController = require('./controllers/barangayController')
const createGpsDeviceController = require('./controllers/gpsDeviceController')
const createNotificationController = require('./controllers/notificationController')
const createOperationalController = require('./controllers/operationalController')
const createPersonnelController = require('./controllers/personnelController')
const createSystemController = require('./controllers/systemController')
const errorHandler = require('./middleware/errorHandler')
const models = require('./models')
const createAccountRoutes = require('./routes/accountRoutes')
const createAnalyticsRoutes = require('./routes/analyticsRoutes')
const createAuditRoutes = require('./routes/auditRoutes')
const createAuthRoutes = require('./routes/authRoutes')
const createBarangayRoutes = require('./routes/barangayRoutes')
const createDashboardRoutes = require('./routes/dashboardRoutes')
const createGpsDeviceRoutes = require('./routes/gpsDeviceRoutes')
const createLocationRoutes = require('./routes/locationRoutes')
const createMediaRoutes = require('./routes/mediaRoutes')
const createNotificationRoutes = require('./routes/notificationRoutes')
const createOperationalRoutes = require('./routes/operationalRoutes')
const createPersonnelRoutes = require('./routes/personnelRoutes')
const createSystemRoutes = require('./routes/systemRoutes')
const createAccountService = require('./services/accountService')
const analyticsService = require('./services/analyticsService')
const auditService = require('./services/auditService')
const authService = require('./services/authService')
const barangayService = require('./services/barangayService')
const flespiService = require('./services/flespiService')
const createFlespiMqttService = require('./services/flespiMqttService')
const createFlespiSyncService = require('./services/flespiSyncService')
const gpsDeviceService = require('./services/gpsDeviceService')
const notificationService = require('./services/notificationService')
const createOperationalService = require('./services/operationalService')
const personnelService = require('./services/personnelService')
const {
	emitPersonnelCollection,
	evaluatePersonnelInactivity,
	evaluatePersonnelGeofences,
	getPersonnelMember,
	getPersonnelWithLocations,
	scopePersonnelForActor,
	updateMockLocations,
} = personnelService
const seedDatabase = require('./services/seedService')

const PORT = process.env.PORT || 4000
const GPS_UPDATE_INTERVAL_MS = 2500
const FLESPI_SYNC_INTERVAL_MS = Math.max(
	2000,
	Number(process.env.FLESPI_SYNC_INTERVAL_MS) || 3000,
)
const HISTORY_SAMPLE_INTERVAL_MS = 30_000
const DEPLOYMENT_STATUS_INTERVAL_MS = Math.max(
	5000,
	Number(process.env.DEPLOYMENT_STATUS_INTERVAL_MS) || 15000,
)

const server = http.createServer(app)
const io = new Server(server, {
	cors: corsOptions,
})

const operationalService = createOperationalService({ io })
const accountService = createAccountService({ io, personnelService })
const flespiSyncService = createFlespiSyncService({
	flespiService,
	personnelService,
})
const operationalController = createOperationalController(operationalService)
const accountController = createAccountController(accountService)
const analyticsController = createAnalyticsController(analyticsService)
const auditController = createAuditController(auditService)
const authController = createAuthController(authService)
const barangayController = createBarangayController(barangayService)
const gpsDeviceController = createGpsDeviceController(gpsDeviceService)
const notificationController = createNotificationController(notificationService)
const personnelController = createPersonnelController({ io, personnelService })
const systemController = createSystemController(flespiService)

app.use('/api', createOperationalRoutes({
	authService,
	controller: operationalController,
}))
app.use('/api/media', createMediaRoutes())
app.use('/api/accounts', createAccountRoutes({
	authService,
	controller: accountController,
}))
app.use('/api/analytics', createAnalyticsRoutes({ authService, controller: analyticsController }))
app.use('/api/audit-logs', createAuditRoutes({ authService, controller: auditController }))
app.use('/api/auth', createAuthRoutes({ authService, controller: authController }))
app.use('/api/barangays', createBarangayRoutes({ authService, controller: barangayController }))
app.use('/api/dashboard', createDashboardRoutes({ authService, controller: analyticsController }))
app.use('/api/gps-devices', createGpsDeviceRoutes({ authService, controller: gpsDeviceController }))
app.use('/api/locations', createLocationRoutes(personnelController))
app.use('/api/notifications', createNotificationRoutes({
	authService,
	controller: notificationController,
}))
app.use('/api/personnel', createPersonnelRoutes({ authService, controller: personnelController }))
app.use('/api', createSystemRoutes({ authService, controller: systemController }))

if (process.env.NODE_ENV === 'production') {
	const frontendDirectory = path.resolve(__dirname, '../../frontend/dist')
	const frontendIndex = path.join(frontendDirectory, 'index.html')

	if (fs.existsSync(frontendIndex)) {
		app.use(express.static(frontendDirectory, {
			index: false,
			maxAge: '1h',
		}))
		app.use((req, res, next) => {
			if (
				req.method !== 'GET'
				|| req.path.startsWith('/api/')
				|| req.path.startsWith('/uploads/')
				|| !req.accepts('html')
			) return next()
			return res.sendFile(frontendIndex)
		})
	} else {
		console.warn(`Frontend build not found at ${frontendDirectory}`)
	}
}

app.use(errorHandler)

io.use(async (socket, next) => {
	const token = String(socket.handshake.auth?.token || '')
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
		const personnel = await getPersonnelWithLocations()
		socket.emit(
			'personnel:bootstrap',
			scopePersonnelForActor(personnel, socket.data.auth?.user),
		)
		await operationalService.registerSocket(socket, socket.data.auth?.user)
	} catch (error) {
		console.error('Socket bootstrap failed:', error)
	}

	socket.on('emergency:request', async ({ id } = {}) => {
		try {
			const requestingUser = socket.data.auth?.user
			if (
				requestingUser?.role === 'officer'
				&& requestingUser.personnelId !== id
			) {
				socket.emit('emergency:status', {
					success: false,
					message: 'Backup can only be requested for your assigned profile.',
				})
				return
			}
			const member = await getPersonnelMember(id)
			if (!member) {
				socket.emit('emergency:status', {
					success: false,
					message: 'Personnel not found.',
				})
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
			console.error('Emergency request failed:', error)
			socket.emit('emergency:status', {
				success: false,
				message: 'Backup request could not be saved.',
			})
		}
	})
})

let locationUpdateRunning = false
let lastHistorySampleAt = 0
let flespiSyncRunning = false
let flespiSyncAllPending = false
const pendingFlespiDeviceIds = new Set()
let flespiMqttService = null
let lifecycleCheckRunning = false

const broadcastMockLocations = async () => {
	if (locationUpdateRunning || mongoose.connection.readyState !== 1) return
	locationUpdateRunning = true

	try {
		const now = Date.now()
		const sampleHistory = now - lastHistorySampleAt >= HISTORY_SAMPLE_INTERVAL_MS
		const personnel = await updateMockLocations({ sampleHistory })
		if (sampleHistory) lastHistorySampleAt = now
		emitPersonnelCollection(io, 'personnel:update', personnel)
	} catch (error) {
		console.error('Mock GPS update failed:', error)
	} finally {
		locationUpdateRunning = false
	}
}

const broadcastFlespiLocations = async ({ deviceIds = [] } = {}) => {
	if (deviceIds.length === 0) flespiSyncAllPending = true
	else deviceIds.forEach((deviceId) => pendingFlespiDeviceIds.add(String(deviceId)))

	if (flespiSyncRunning || mongoose.connection.readyState !== 1) return
	flespiSyncRunning = true

	try {
		while (flespiSyncAllPending || pendingFlespiDeviceIds.size > 0) {
			const syncAll = flespiSyncAllPending
			flespiSyncAllPending = false
			const selectedDeviceIds = syncAll
				? []
				: [...pendingFlespiDeviceIds]
			pendingFlespiDeviceIds.clear()

			const result = await flespiSyncService.syncAssignedLocations({
				deviceIds: selectedDeviceIds,
			})
			if (result.accepted > 0) {
				emitPersonnelCollection(
					io,
					'personnel:update',
					await getPersonnelWithLocations(),
				)
			}
		}
	} catch (error) {
		console.error('Flespi GPS sync failed:', error.message)
	} finally {
		flespiSyncRunning = false
	}
}

const runFlespiFallbackSync = () => {
	if (flespiMqttService?.isConnected()) return
	void broadcastFlespiLocations()
}

const runOperationalLifecycleCheck = async () => {
	if (lifecycleCheckRunning || mongoose.connection.readyState !== 1) return
	lifecycleCheckRunning = true
	try {
		await operationalService.reconcileDeploymentShifts()
		await evaluatePersonnelInactivity({ io })
		await evaluatePersonnelGeofences({ io })
	} catch (error) {
		console.error('Operational lifecycle check failed:', error.message)
	} finally {
		lifecycleCheckRunning = false
	}
}

const start = async () => {
	try {
		await connectDB()
		await seedDatabase(models)
		console.log('MongoDB collections and indexes are ready')
		await operationalService.reconcileDeploymentShifts({ broadcast: false })

		server.listen(PORT, () => {
			console.log(`GeoSentri backend server running on port ${PORT}`)
		})
		setInterval(broadcastMockLocations, GPS_UPDATE_INTERVAL_MS)
		setInterval(runOperationalLifecycleCheck, DEPLOYMENT_STATUS_INTERVAL_MS)
		if (process.env.FLESPI_TOKEN) {
			flespiMqttService = createFlespiMqttService({
				onDeviceTelemetry: (deviceId) => broadcastFlespiLocations({
					deviceIds: [deviceId],
				}),
			})
			const mqttEnabled = flespiMqttService.start()
			console.log(mqttEnabled
				? 'Flespi MQTT realtime sync enabled'
				: 'Flespi MQTT disabled; using REST polling')
			console.log(`Flespi REST fallback enabled (${FLESPI_SYNC_INTERVAL_MS}ms interval)`)
			// Seed the UI with the latest complete snapshot even before the next MQTT event.
			setTimeout(() => void broadcastFlespiLocations(), 1000)
			setInterval(runFlespiFallbackSync, FLESPI_SYNC_INTERVAL_MS)
		} else {
			console.log('Flespi GPS sync disabled: FLESPI_TOKEN is not configured')
		}
	} catch (error) {
		console.error('Backend startup failed:', error)
		process.exitCode = 1
	}
}

start()
