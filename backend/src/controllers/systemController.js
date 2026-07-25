const createSystemController = (flespiService) => ({
	getHealth: (_req, res) => {
		res.json({ status: 'ok', service: 'BantayCabagan backend' })
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
