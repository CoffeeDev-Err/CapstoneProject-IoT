const createSystemController = (flespiService, { checkDatabase = async () => false } = {}) => ({
	getHealth: (_req, res) => {
		res.set('Cache-Control', 'no-store')
		res.json({ status: 'ok', service: 'GeoSentri backend' })
	},
	getReadiness: async (_req, res) => {
		let timer
		let ready
		try {
			ready = await Promise.race([
				checkDatabase(),
				new Promise((resolve) => { timer = setTimeout(() => resolve(false), 3000) }),
			])
		} catch {
			ready = false
		} finally {
			clearTimeout(timer)
		}
		res.set('Cache-Control', 'no-store')
		res.status(ready ? 200 : 503).json({
			status: ready ? 'ready' : 'unavailable',
			service: 'GeoSentri backend',
			database: ready ? 'available' : 'unavailable',
		})
	},

	getFlespiDevices: async (req, res) => {
		try {
			const devices = await flespiService.fetchRegisteredDevices({
				forceRefresh: req.query.refresh === 'true',
			})
			res.json({
				devices,
				count: devices.length,
				source: 'flespi',
			})
		} catch (error) {
			error.status = error.code === 'FLESPI_NOT_CONFIGURED' ? 503 : 502
			error.code = error.code || 'FLESPI_REQUEST_FAILED'
			throw error
		}
	},
})

module.exports = createSystemController
