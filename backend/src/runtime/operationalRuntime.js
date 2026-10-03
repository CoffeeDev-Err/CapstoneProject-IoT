const createOperationalRuntime = ({
	io,
	isDatabaseReady,
	operationalService,
	personnelService,
	flespiSyncService,
	createFlespiMqttService,
	intervals,
	flespiToken,
	clock = Date.now,
	logger = console,
}) => {
	const {
		emitPersonnelCollection,
		evaluatePersonnelBattery,
		evaluatePersonnelGeofences,
		evaluatePersonnelGpsAvailability,
		evaluatePersonnelInactivity,
		getPersonnelWithLocations,
		updateMockLocations,
	} = personnelService
	let locationUpdateRunning = false
	let lastHistorySampleAt = 0
	let flespiSyncRunning = false
	let flespiSyncAllPending = false
	let lastFlespiFullSyncAt = null
	const pendingFlespiDeviceIds = new Set()
	let flespiMqttService = null
	let lifecycleCheckRunning = false
	const timers = new Set()

	const broadcastMockLocations = async () => {
		if (locationUpdateRunning || !isDatabaseReady()) return
		locationUpdateRunning = true
		try {
			const currentTime = Date.now()
			const sampleHistory = currentTime - lastHistorySampleAt >= intervals.historySample
			const personnel = await updateMockLocations({ sampleHistory })
			if (sampleHistory) lastHistorySampleAt = currentTime
			emitPersonnelCollection(io, 'personnel:update', personnel)
		} catch (error) {
			logger.error('Mock GPS update failed:', error)
		} finally {
			locationUpdateRunning = false
		}
	}

	const broadcastFlespiLocations = async ({ deviceIds = [] } = {}) => {
		if (deviceIds.length === 0) flespiSyncAllPending = true
		else deviceIds.forEach((deviceId) => pendingFlespiDeviceIds.add(String(deviceId)))
		if (flespiSyncRunning || !isDatabaseReady()) return
		flespiSyncRunning = true
		try {
			while (flespiSyncAllPending || pendingFlespiDeviceIds.size > 0) {
				const syncAll = flespiSyncAllPending
				flespiSyncAllPending = false
				const selectedDeviceIds = syncAll ? [] : [...pendingFlespiDeviceIds]
				pendingFlespiDeviceIds.clear()
				if (syncAll) lastFlespiFullSyncAt = clock()
				const result = await flespiSyncService.syncAssignedLocations({
					deviceIds: selectedDeviceIds,
				})
				if (result.accepted > 0) {
					emitPersonnelCollection(io, 'personnel:update', await getPersonnelWithLocations())
					await operationalService.reconcileTaskArrivals()
				}
			}
		} catch (error) {
			logger.error('Flespi GPS sync failed:', error.message)
		} finally {
			flespiSyncRunning = false
		}
	}

	const runFlespiFallbackSync = () => {
		// A connected broker does not prove telemetry subscriptions are delivering.
		// Reconcile all on-duty trackers at least every ten seconds even with MQTT.
		const watchdogInterval = Math.max(intervals.flespiSync,
			Math.floor(10_000 / intervals.flespiSync) * intervals.flespiSync)
		if (flespiMqttService?.isConnected()
			&& lastFlespiFullSyncAt !== null
			&& clock() - lastFlespiFullSyncAt < watchdogInterval) return
		return broadcastFlespiLocations()
	}

	const runOperationalLifecycleCheck = async () => {
		if (lifecycleCheckRunning || !isDatabaseReady()) return
		lifecycleCheckRunning = true
		try {
			await operationalService.reconcileDeploymentShifts()
			await operationalService.reconcileTaskArrivals()
			await evaluatePersonnelGpsAvailability({ io })
			await evaluatePersonnelBattery({ io })
			await evaluatePersonnelInactivity({ io })
			await evaluatePersonnelGeofences({ io })
			await operationalService.finalizeReportRouteSnapshots()
		} catch (error) {
			logger.error('Operational lifecycle check failed:', error.message)
		} finally {
			lifecycleCheckRunning = false
		}
	}

	const trackInterval = (callback, delay) => {
		const timer = setInterval(callback, delay)
		timers.add(timer)
		return timer
	}

	const start = () => {
		trackInterval(broadcastMockLocations, intervals.gpsUpdate)
		trackInterval(runOperationalLifecycleCheck, intervals.deploymentStatus)
		if (!flespiToken) {
			logger.log('Flespi GPS sync disabled: FLESPI_TOKEN is not configured')
			return
		}
		flespiMqttService = createFlespiMqttService({
			onDeviceTelemetry: (deviceId) => broadcastFlespiLocations({ deviceIds: [deviceId] }),
		})
		const mqttEnabled = flespiMqttService.start()
		logger.log(mqttEnabled
			? 'Flespi MQTT realtime sync enabled'
			: 'Flespi MQTT disabled; using REST polling')
		logger.log(`Flespi REST fallback enabled (${intervals.flespiSync}ms interval)`)
		const initialSyncTimer = setTimeout(() => void broadcastFlespiLocations(), 1000)
		timers.add(initialSyncTimer)
		trackInterval(runFlespiFallbackSync, intervals.flespiSync)
	}

	const stop = () => {
		timers.forEach((timer) => {
			clearInterval(timer)
			clearTimeout(timer)
		})
		timers.clear()
		flespiMqttService?.stop?.()
		flespiMqttService = null
	}

	return {
		broadcastFlespiLocations,
		broadcastMockLocations,
		runFlespiFallbackSync,
		runOperationalLifecycleCheck,
		start,
		stop,
	}
}

module.exports = createOperationalRuntime
