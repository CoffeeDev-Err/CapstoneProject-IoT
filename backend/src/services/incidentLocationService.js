const { findCabaganBarangay } = require('../constants/cabaganBarangays')
const { isInsideCabagan } = require('../utils/cabaganGeofence')
const { resolveLocationName } = require('./reverseGeocodingService')

// Address lookup is a suggestion, not a surveyed barangay boundary. The
// reporting officer can correct it before submission, including when offline.
const resolveIncidentLocation = async (query, lookup = resolveLocationName) => {
	const validNumber = (value) => ['string', 'number'].includes(typeof value)
		&& String(value).trim() !== '' && Number.isFinite(Number(value))
	if (!validNumber(query.latitude) || !validNumber(query.longitude)
		|| !isInsideCabagan(Number(query.latitude), Number(query.longitude))) {
		const error = new Error('Select a valid incident point within Cabagan.')
		error.status = 400
		throw error
	}
	const latitude = Number(query.latitude)
	const longitude = Number(query.longitude)
	const location = await lookup(latitude, longitude)
	const matches = [...new Set(location.split(',')
		.map((part) => findCabaganBarangay(part)?.name).filter(Boolean))]
	return { latitude, longitude, location, barangay: matches.length === 1 ? matches[0] : '' }
}

module.exports = { resolveIncidentLocation }
