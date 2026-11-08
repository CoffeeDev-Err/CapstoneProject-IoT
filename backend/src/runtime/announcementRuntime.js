module.exports = ({ service, isDatabaseReady, logger = console }) => {
	let timer
	const tick = async () => {
		if (!isDatabaseReady()) return
		try { await service.runOnce() } catch (error) { logger.error('Announcement queue failed:', error.name) }
	}
	return {
		tick,
		start: () => {
			if (timer) return
			timer = setInterval(() => void tick(), 5000)
			timer.unref?.()
			void tick()
		},
		stop: () => { clearInterval(timer); timer = null },
	}
}
