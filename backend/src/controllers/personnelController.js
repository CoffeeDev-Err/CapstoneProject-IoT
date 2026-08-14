const createPersonnelController = ({ io, personnelService }) => ({
	getPersonnel: async (req, res) => {
		res.json(await personnelService.listPersonnel(req.query, req.auth.user))
	},

	getPersonnelMember: async (req, res) => {
		const personnel = await personnelService.getPersonnelMember(
			req.params.personnelId,
			req.auth.user,
		)
		if (!personnel) {
			return res.status(404).json({
				success: false,
				message: 'Personnel not found.',
			})
		}
		return res.json({ personnel })
	},

	updateDutyStatus: async (req, res) => {
		const personnel = await personnelService.updateDutyStatus(
			req.params.personnelId,
			req.body?.duty_status,
		)
		if (!personnel) {
			return res.status(404).json({
				success: false,
				message: 'Personnel not found.',
			})
		}
		personnelService.emitPersonnelCollection(
			io,
			'personnel:update',
			await personnelService.getPersonnelWithLocations(),
		)
		return res.json({ success: true, personnel })
	},

	getLocationHistory: async (req, res) => {
		const personnel = await personnelService.getPersonnelMember(req.params.personnelId)
		if (!personnel) {
			return res.status(404).json({
				success: false,
				message: 'Personnel not found.',
			})
		}
		return res.json(
			await personnelService.getLocationHistory(req.params.personnelId, req.query),
		)
	},

	ingestLocation: async (req, res) => {
		const result = await personnelService.ingestLocation({
			...req.body,
			source: 'gps',
		})
		if (result.accepted) {
			personnelService.emitPersonnelCollection(
				io,
				'personnel:update',
				await personnelService.getPersonnelWithLocations(),
			)
		}
		res.status(result.accepted ? 202 : 200).json({
			success: true,
			...result,
		})
	},
})

module.exports = createPersonnelController
