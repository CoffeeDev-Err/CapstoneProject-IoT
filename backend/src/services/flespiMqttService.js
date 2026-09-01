const mqtt = require('mqtt')

const DEFAULT_BROKER_URL = 'mqtts://mqtt.flespi.io:8883'
const DEFAULT_TOPIC = 'flespi/state/gw/devices/+/telemetry/+'

const parseEnabled = (value) => !['0', 'false', 'no', 'off'].includes(
	String(value ?? 'true').trim().toLowerCase(),
)

const createFlespiMqttService = ({
	onDeviceTelemetry,
	mqttConnect = mqtt.connect,
	environment = process.env,
	setTimer = setTimeout,
	clearTimer = clearTimeout,
	clock = Date.now,
	logger = console,
}) => {
	let client = null
	let connected = false
	const pendingDevices = new Map()

	const debounceMs = Math.max(
		100,
		Number(environment.FLESPI_MQTT_DEBOUNCE_MS) || 250,
	)
	const topic = String(environment.FLESPI_MQTT_TOPIC || DEFAULT_TOPIC).trim()

	const clearPendingDevices = () => {
		for (const timeout of pendingDevices.values()) clearTimer(timeout)
		pendingDevices.clear()
	}

	const scheduleDeviceSync = (deviceId) => {
		const previousTimeout = pendingDevices.get(deviceId)
		if (previousTimeout) clearTimer(previousTimeout)

		pendingDevices.set(deviceId, setTimer(async () => {
			pendingDevices.delete(deviceId)
			try {
				await onDeviceTelemetry(deviceId)
			} catch (error) {
				logger.error(`Flespi MQTT device sync failed (${deviceId}):`, error.message)
			}
		}, debounceMs))
	}

	const start = () => {
		if (!parseEnabled(environment.FLESPI_MQTT_ENABLED)) return false

		const token = String(environment.FLESPI_TOKEN || '').trim()
		if (!token) return false

		const brokerUrl = String(
			environment.FLESPI_MQTT_URL || DEFAULT_BROKER_URL,
		).trim()
		client = mqttConnect(brokerUrl, {
			username: token,
			clientId: `geosentri-backend-${process.pid}-${clock().toString(36)}`,
			clean: true,
			connectTimeout: 10_000,
			reconnectPeriod: 3_000,
			protocolVersion: 5,
		})

		client.on('connect', () => {
			client.subscribe(topic, { qos: 1 }, (error) => {
				if (error) {
					connected = false
					logger.error('Flespi MQTT subscription failed:', error.message)
					return
				}
				connected = true
				logger.log(`Flespi MQTT connected and subscribed to ${topic}`)
			})
		})

		client.on('message', (messageTopic) => {
			const match = /^flespi\/state\/gw\/devices\/([^/]+)\/telemetry\/.+$/.exec(
				messageTopic,
			)
			if (match?.[1]) scheduleDeviceSync(match[1])
		})

		client.on('reconnect', () => {
			connected = false
		})
		client.on('close', () => {
			connected = false
		})
		client.on('offline', () => {
			connected = false
		})
		client.on('error', (error) => {
			connected = false
			logger.error('Flespi MQTT connection error:', error.message)
		})

		return true
	}

	const stop = async () => {
		connected = false
		clearPendingDevices()
		if (!client) return

		const activeClient = client
		client = null
		await new Promise((resolve) => activeClient.end(false, resolve))
	}

	return {
		isConnected: () => connected,
		start,
		stop,
	}
}

module.exports = createFlespiMqttService
