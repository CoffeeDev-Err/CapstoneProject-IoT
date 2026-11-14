// Mirrors the municipal polygon used by the web map so both channels evaluate
// the same allowed Cabagan boundary.
const geography = require('../../../contracts/geography/cabagan-geography.json')
// Keep the existing lat/lng API, using only the downloaded municipality.
const CABAGAN_BOUNDARY_COORDS = geography.municipality.geometry.coordinates[0]
	.slice(0, -1).map(([longitude, latitude]) => [latitude, longitude])

const boundary = CABAGAN_BOUNDARY_COORDS.map(([latitude, longitude]) => (
	[longitude, latitude]
))

const isPointOnSegment = (point, start, end) => {
	const [x, y] = point
	const [x1, y1] = start
	const [x2, y2] = end
	const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1)
	if (Math.abs(cross) > 1e-12) return false
	const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)
	if (dot < 0) return false
	return dot <= (x2 - x1) ** 2 + (y2 - y1) ** 2
}

const isInsideCabagan = (latitude, longitude) => {
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
	const point = [longitude, latitude]
	let inside = false
	for (let index = 0, previousIndex = boundary.length - 1;
		index < boundary.length;
		previousIndex = index, index += 1) {
		const current = boundary[index]
		const previous = boundary[previousIndex]
		if (isPointOnSegment(point, previous, current)) return true
		const [currentX, currentY] = current
		const [previousX, previousY] = previous
		const intersects = ((currentY > point[1]) !== (previousY > point[1]))
			&& (point[0] < ((previousX - currentX) * (point[1] - currentY))
			/ (previousY - currentY) + currentX)
		if (intersects) inside = !inside
	}
	return inside
}

module.exports = { CABAGAN_BOUNDARY_COORDS, isInsideCabagan }
