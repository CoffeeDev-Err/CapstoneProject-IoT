const { isInsideCabagan } = require('../utils/cabaganGeofence')
const { createValidationError } = require('../utils/operationalValidation')
const { scheduleRequest } = require('./reverseGeocodingService')
const placeCache = new Map()
const geography = require('../../../contracts/geography/cabagan-geography.json')
// Bundled, versioned geometry: no remote boundary service or availability window.
const loadBarangayBoundaries = async () => ({
	...geography.barangays, source: geography.version, attribution: geography.attribution,
})

const searchPatrolPlaces = async (query) => {
	const q = String(query || '').trim()
	if (q.length < 2 || q.length > 120) throw createValidationError('Enter 2 to 120 characters to search.', 'q')
	const key = q.toLowerCase()
	const cached = placeCache.get(key)
	if (cached && cached.expires > Date.now()) return cached.value
	const value = scheduleRequest(async () => {
	const params = new URLSearchParams({ q: `${q}, Cabagan, Isabela, Philippines`, format: 'jsonv2', limit: '8', countrycodes: 'ph' })
	const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
		headers: { 'User-Agent': process.env.REVERSE_GEOCODING_USER_AGENT || 'GeoSentri-Capstone/1.0' }, signal: AbortSignal.timeout(7000),
	})
	if (!response.ok) throw new Error('Place search is unavailable. Search a barangay and select the exact point on the map.')
	return (await response.json()).map(p => ({ label: p.display_name, latitude: Number(p.lat), longitude: Number(p.lon) }))
		.filter(p => isInsideCabagan(p.latitude, p.longitude))
	}).catch(error => { placeCache.delete(key); throw error })
	if (placeCache.size >= 200) placeCache.delete(placeCache.keys().next().value)
	placeCache.set(key, { value, expires: Date.now() + 3600000 })
	return value
}

const getPatrolDirections = async ({ points, mode } = {}) => {
	if (!['car', 'motorcycle', 'walk'].includes(mode)) return { available: false, message: 'Choose a supported patrol travel mode.' }
	if (mode === 'walk' && !process.env.OSRM_WALK_ROUTE_URL) return { available: false, message: 'Walking directions unavailable. Plot the actual walkway and its turns; vehicle directions are not walking directions.' }
	if (!Array.isArray(points) || points.length < 2 || points.length > 30 || points.some(p => !p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || !isInsideCabagan(p.latitude, p.longitude))) throw createValidationError('Choose 2 to 30 points within Cabagan.', 'points')
	const coordinates = points.map(p => `${p.longitude},${p.latitude}`).join(';')
	const endpoint = mode === 'walk' ? process.env.OSRM_WALK_ROUTE_URL : process.env.OSRM_ROUTE_URL || 'https://router.project-osrm.org/route/v1/driving'
	try {
		const response = await fetch(`${endpoint}/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(7000) })
		const payload = await response.json()
		const route = payload.routes?.[0]
		if (!response.ok || payload.code !== 'Ok' || route?.geometry?.type !== 'LineString') throw new Error('Unavailable')
		if (!Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2
			|| route.geometry.coordinates.some(p => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite))) throw new Error('Invalid route geometry')
		return { available: true, geometry: route.geometry, distanceMeters: route.distance, durationSeconds: route.duration }
	} catch { return { available: false, message: 'Road directions unavailable. The destination remains visible.' } }
}
module.exports = { loadBarangayBoundaries, searchPatrolPlaces, getPatrolDirections }
