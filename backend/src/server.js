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
const { readSessionCookie } = require('./config/authCookie')
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
const seedDatabase = require('./services/seedService')
const registerSocketGateway = require('./runtime/socketGateway')
const createOperationalRuntime = require('./runtime/operationalRuntime')

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
const systemController = createSystemController(flespiService, {
	checkDatabase: async () => {
		if (mongoose.connection.readyState !== 1) return false
		await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 2500 })
		return true
	},
})

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

registerSocketGateway({
	io,
	authService,
	operationalService,
	personnelService,
	readSessionCookie,
})

const operationalRuntime = createOperationalRuntime({
	io,
	isDatabaseReady: () => mongoose.connection.readyState === 1,
	operationalService,
	personnelService,
	flespiSyncService,
	createFlespiMqttService,
	flespiToken: process.env.FLESPI_TOKEN,
	intervals: {
		gpsUpdate: GPS_UPDATE_INTERVAL_MS,
		flespiSync: FLESPI_SYNC_INTERVAL_MS,
		historySample: HISTORY_SAMPLE_INTERVAL_MS,
		deploymentStatus: DEPLOYMENT_STATUS_INTERVAL_MS,
	},
})

const start = async () => {
	try {
		await connectDB()
		await seedDatabase(models)
		console.log('MongoDB collections and indexes are ready')
		await operationalService.reconcileDeploymentShifts({ broadcast: false })

		server.listen(PORT, () => {
			console.log(`GeoSentri backend server running on port ${PORT}`)
		})
		operationalRuntime.start()
	} catch (error) {
		console.error('Backend startup failed:', error)
		process.exitCode = 1
	}
}

start()
