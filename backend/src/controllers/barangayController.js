const { resolveIncidentLocation } = require('../services/incidentLocationService')

const createBarangayController = (barangayService) => ({
	resolveIncidentLocation: async (req, res) => {
		res.json(await resolveIncidentLocation(req.query))
	},
	getBarangays: async (req, res) => {
		res.json({ barangays: await barangayService.listBarangays(req.query) })
	},

	getBarangay: async (req, res) => {
		const barangay = await barangayService.getBarangay(req.params.code)
		if (!barangay) {
			return res.status(404).json({
				success: false,
				message: 'Barangay not found.',
			})
		}
		return res.json({ barangay })
	},
})

module.exports = createBarangayController
