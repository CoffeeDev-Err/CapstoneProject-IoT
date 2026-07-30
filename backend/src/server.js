const http = require('http')
const mongoose = require('mongoose')
const { Server } = require('socket.io')
const app = require('./app')
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
const createFlespiSyncService = require('./services/flespiSyncService')
const gpsDeviceService = require('./services/gpsDeviceService')
const notificationService = require('./services/notificationService')
const createOperationalService = require('./services/operationalService')
const personnelService = require('./services/personnelService')
const {
	getPersonnelMember,
	getPersonnelWithLocations,
	updateMockLocations,
} = personnelService
const seedDatabase = require('./services/seedService')
require('dotenv').config()

const PORT = process.env.PORT || 4000
const GPS_UPDATE_INTERVAL_MS = 2500
const FLESPI_SYNC_INTERVAL_MS = Math.max(
	2000,
	Number(process.env.FLESPI_SYNC_INTERVAL_MS) || 3000,
)
const HISTORY_SAMPLE_INTERVAL_MS = 30_000

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
	},
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
app.use('/api/accounts', createAccountRoutes({
	authService,
	controller: accountController,
}))
app.use('/api/analytics', createAnalyticsRoutes(analyticsController))
app.use('/api/audit-logs', createAuditRoutes(auditController))
app.use('/api/auth', createAuthRoutes({ authService, controller: authController }))
app.use('/api/barangays', createBarangayRoutes(barangayController))
app.use('/api/dashboard', createDashboardRoutes(analyticsController))
app.use('/api/gps-devices', createGpsDeviceRoutes(gpsDeviceController))
app.use('/api/locations', createLocationRoutes(personnelController))
app.use('/api/notifications', createNotificationRoutes(notificationController))
app.use('/api/personnel', createPersonnelRoutes(personnelController))
app.use('/api', createSystemRoutes(systemController))
app.use(errorHandler)

io.on('connection', async (socket) => {
	try {
		const personnel = await getPersonnelWithLocations()
		socket.emit('personnel:bootstrap', personnel)
		await operationalService.registerSocket(socket)
	} catch (error) {
		console.error('Socket bootstrap failed:', error)
	}

	socket.on('emergency:request', async ({ id } = {}) => {
		try {
			const member = await getPersonnelMember(id)
			if (!member) {
				socket.emit('emergency:status', {
					success: false,
					message: 'Personnel not found.',
				})
				return
			}

			io.emit('emergency:alert', {
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

const broadcastMockLocations = async () => {
	if (locationUpdateRunning || mongoose.connection.readyState !== 1) return
	locationUpdateRunning = true

	try {
		const now = Date.now()
		const sampleHistory = now - lastHistorySampleAt >= HISTORY_SAMPLE_INTERVAL_MS
		const personnel = await updateMockLocations({ sampleHistory })
		if (sampleHistory) lastHistorySampleAt = now
		io.emit('personnel:update', personnel)
	} catch (error) {
		console.error('Mock GPS update failed:', error)
	} finally {
		locationUpdateRunning = false
	}
}

const broadcastFlespiLocations = async () => {
	if (flespiSyncRunning || mongoose.connection.readyState !== 1) return
	flespiSyncRunning = true

	try {
		const result = await flespiSyncService.syncAssignedLocations()
		if (result.accepted > 0) {
			io.emit('personnel:update', await getPersonnelWithLocations())
		}
	} catch (error) {
		console.error('Flespi GPS sync failed:', error.message)
	} finally {
		flespiSyncRunning = false
	}
}

const start = async () => {
	try {
		await connectDB()
		await seedDatabase(models)
		console.log('MongoDB collections and indexes are ready')

		server.listen(PORT, () => {
			console.log(`BantayCabagan backend server running on port ${PORT}`)
		})
		setInterval(broadcastMockLocations, GPS_UPDATE_INTERVAL_MS)
		if (process.env.FLESPI_TOKEN) {
			console.log(`Flespi GPS sync enabled (${FLESPI_SYNC_INTERVAL_MS}ms interval)`)
			setTimeout(broadcastFlespiLocations, 1000)
			setInterval(broadcastFlespiLocations, FLESPI_SYNC_INTERVAL_MS)
		} else {
			console.log('Flespi GPS sync disabled: FLESPI_TOKEN is not configured')
		}
	} catch (error) {
		console.error('Backend startup failed:', error)
		process.exitCode = 1
	}
}

start()
