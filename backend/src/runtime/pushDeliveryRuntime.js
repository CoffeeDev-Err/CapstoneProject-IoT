const createPushDeliveryRuntime = ({ service, isDatabaseReady, logger = console, intervalMs = 5000 }) => {
	let timer
	let running = false
	const tick = async () => {
		if (running || !isDatabaseReady()) return
		running = true
		try {
			await service.runOnce()
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
		clearInterval(timer)
		timer = null
	}
	return { start, stop, tick }
}

module.exports = createPushDeliveryRuntime
