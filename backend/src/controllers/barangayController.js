const createBarangayController = (barangayService) => ({
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
