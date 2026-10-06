const createPushDeliveryRuntime = ({ service, isDatabaseReady, logger = console, intervalMs = 5000 }) => {
	let timer
	let running = false
	let pending = false
	const tick = async () => {
		if (!isDatabaseReady()) return
		if (running) {
			pending = true
			return
		}
		running = true
		try {
			do {
				pending = false
				await service.runOnce()
			} while (pending && isDatabaseReady())
		} catch (error) {
			logger.error('Push delivery queue failed:', error.name)
		} finally {
			running = false
		}
	}
	const start = () => {
		if (timer) return
		timer = setInterval(() => void tick(), intervalMs)
		timer.unref?.()
		void tick()
	}
	const stop = () => {
		pending = false
		clearInterval(timer)
		timer = null
	}
	return { start, stop, tick }
}

module.exports = createPushDeliveryRuntime
