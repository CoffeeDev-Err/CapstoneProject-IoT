const createGpsDeviceController = (gpsDeviceService) => ({
	getAssignments: async (req, res) => {
		res.json(await gpsDeviceService.listAssignments(req.query))
	},
})

module.exports = createGpsDeviceController
