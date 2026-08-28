const MAX_MOCK_OFFSET = 0.002

const createMockMovementService = ({
	models,
	getPersonnelWithLocations,
	clock = () => new Date(),
	random = Math.random,
}) => {
	const { CurrentLocation, GpsDeviceAssignment, LocationHistory } = models
	const mockAnchors = new Map([
		['psms-002', [121.7683, 17.4213]],
	])

	const updateMockLocations = async ({ sampleHistory = false } = {}) => {
		const assignedPersonnelIds = await GpsDeviceAssignment.distinct(
			'personnelId',
			{ status: 'active' },
		)
		const locations = await CurrentLocation.find({
			source: 'mock',
			isSimulated: true,
			personnelId: { $nin: assignedPersonnelIds },
		})
		if (locations.length === 0) return getPersonnelWithLocations()

		const now = clock()
		const history = []
		for (const current of locations) {
			const [longitude, latitude] = current.location.coordinates
			if (!mockAnchors.has(current.personnelId)) {
				mockAnchors.set(current.personnelId, [longitude, latitude])
			}
			const [anchorLongitude, anchorLatitude] = mockAnchors.get(current.personnelId)
			const nextLongitude = Math.max(
				anchorLongitude - MAX_MOCK_OFFSET,
				Math.min(anchorLongitude + MAX_MOCK_OFFSET, longitude + ((random() - 0.5) * 0.0018)),
			)
			const nextLatitude = Math.max(
				anchorLatitude - MAX_MOCK_OFFSET,
				Math.min(anchorLatitude + MAX_MOCK_OFFSET, latitude + ((random() - 0.5) * 0.0018)),
			)
			current.location.coordinates = [nextLongitude, nextLatitude]
			current.recordedAt = now
			current.receivedAt = now
			await current.save()

			if (sampleHistory) {
				history.push({
					personnelId: current.personnelId,
					deviceAssignmentId: current.deviceAssignmentId,
					location: { type: 'Point', coordinates: [nextLongitude, nextLatitude] },
					accuracy: current.accuracy,
					speed: current.speed,
					heading: current.heading,
					source: current.source,
					isSimulated: current.isSimulated,
					recordedAt: now,
				})
			}
		}
		if (history.length > 0) await LocationHistory.insertMany(history)
		return getPersonnelWithLocations()
	}

	return { updateMockLocations }
}

module.exports = createMockMovementService
module.exports.MAX_MOCK_OFFSET = MAX_MOCK_OFFSET
