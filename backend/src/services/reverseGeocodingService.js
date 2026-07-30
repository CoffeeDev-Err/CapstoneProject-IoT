const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000
const MIN_REQUEST_INTERVAL_MS = 1100
const REQUEST_TIMEOUT_MS = 5000

const cache = new Map()
const pendingRequests = new Map()
let requestQueue = Promise.resolve()
let lastRequestAt = 0

const formatCoordinates = (latitude, longitude) => (
	`GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
)

const getCacheKey = (latitude, longitude) => (
	`${latitude.toFixed(4)},${longitude.toFixed(4)}`
)

const readCachedValue = (key) => {
	const entry = cache.get(key)
	if (!entry) return null
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key)
		return null
	}
	return entry.value
}

const writeCachedValue = (key, value, ttl = CACHE_TTL_MS) => {
	if (cache.size >= 500) {
		cache.delete(cache.keys().next().value)
	}
	cache.set(key, {
		value,
		expiresAt: Date.now() + ttl,
	})
}

const scheduleRequest = (request) => {
	const run = async () => {
		const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt))
		if (waitMs > 0) {
			await new Promise((resolve) => {
				setTimeout(resolve, waitMs)
			})
		}
		lastRequestAt = Date.now()
		return request()
	}

	requestQueue = requestQueue.then(run, run)
	return requestQueue
}

const getLocalityName = (address = {}) => (
	address.village
	|| address.suburb
	|| address.neighbourhood
	|| address.quarter
	|| address.city_district
	|| address.town
	|| address.city
	|| address.municipality
	|| address.county
)

const getAreaName = (address = {}) => (
	address.municipality
	|| address.town
	|| address.city
	|| address.county
	|| address.state
)

const formatLocationName = (payload, fallback) => {
	const locality = getLocalityName(payload?.address)
	const area = getAreaName(payload?.address)

	if (locality && area && locality !== area) {
		return `${locality}, ${area}`
	}
	if (locality) return locality
	return payload?.display_name?.split(',').slice(0, 2).join(',').trim() || fallback
}

const fetchLocationName = async (latitude, longitude, fallback) => {
	const endpoint = process.env.REVERSE_GEOCODING_URL
		|| 'https://nominatim.openstreetmap.org/reverse'
	const query = new URLSearchParams({
		format: 'jsonv2',
		lat: String(latitude),
		lon: String(longitude),
		zoom: '16',
		addressdetails: '1',
	})
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

	try {
		const response = await fetch(`${endpoint}?${query}`, {
			headers: {
				'Accept-Language': 'en',
				'User-Agent': process.env.REVERSE_GEOCODING_USER_AGENT
					|| 'BantayCabagan-Capstone/1.0',
			},
			signal: controller.signal,
		})
		if (!response.ok) return fallback
		return formatLocationName(await response.json(), fallback)
	} catch {
		return fallback
	} finally {
		clearTimeout(timeout)
	}
}

const resolveLocationName = async (latitudeValue, longitudeValue) => {
	const latitude = Number(latitudeValue)
	const longitude = Number(longitudeValue)
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return 'Location unavailable'
	}

	const fallback = formatCoordinates(latitude, longitude)
	if (process.env.REVERSE_GEOCODING_ENABLED === 'false') return fallback

	const key = getCacheKey(latitude, longitude)
	const cached = readCachedValue(key)
	if (cached) return cached
	if (pendingRequests.has(key)) return pendingRequests.get(key)

	const pending = scheduleRequest(async () => {
		const locationName = await fetchLocationName(latitude, longitude, fallback)
		writeCachedValue(
			key,
			locationName,
			locationName === fallback ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS,
		)
		return locationName
	}).finally(() => {
		pendingRequests.delete(key)
	})

	pendingRequests.set(key, pending)
	return pending
}

module.exports = {
	formatCoordinates,
	resolveLocationName,
}
