const DEFAULT_LATITUDE = 17.4239
const DEFAULT_LONGITUDE = 121.7681

const AREA_COORDINATES = {
	'Barangay Centro': { latitude: 17.4239, longitude: 121.7681 },
	'Barangay Cubag': { latitude: 17.4272, longitude: 121.7658 },
	'Barangay Garita': { latitude: 17.4148, longitude: 121.7762 },
	'Barangay San Juan': { latitude: 17.4192, longitude: 121.7546 },
	'Cabagan Public Market Zone': { latitude: 17.4272, longitude: 121.7658 },
	'Municipal Hall Perimeter': { latitude: 17.4239, longitude: 121.7681 },
	'Barangay Centro Route': { latitude: 17.4248, longitude: 121.7669 },
	'Highway Checkpoint North': { latitude: 17.4326, longitude: 121.7624 },
	'School Safety Patrol Route': { latitude: 17.4192, longitude: 121.7546 },
}

const getAreaCoordinates = (area) => AREA_COORDINATES[area] || {
	latitude: DEFAULT_LATITUDE,
	longitude: DEFAULT_LONGITUDE,
}

const point = (longitude, latitude) => ({
	type: 'Point',
	coordinates: [Number(longitude), Number(latitude)],
})

const isValidCoordinates = (latitude, longitude) => (
	Number.isFinite(latitude)
	&& Number.isFinite(longitude)
	&& latitude >= -90
	&& latitude <= 90
	&& longitude >= -180
	&& longitude <= 180
)

const distanceInMeters = (first = [], second = []) => {
	if (
		first.length !== 2
		|| second.length !== 2
		|| !first.every(Number.isFinite)
		|| !second.every(Number.isFinite)
	) return Number.POSITIVE_INFINITY
	const toRadians = (value) => (value * Math.PI) / 180
	const [firstLongitude, firstLatitude] = first
	const [secondLongitude, secondLatitude] = second
	const latitudeDelta = toRadians(secondLatitude - firstLatitude)
	const longitudeDelta = toRadians(secondLongitude - firstLongitude)
	const a = Math.sin(latitudeDelta / 2) ** 2
		+ Math.cos(toRadians(firstLatitude))
		* Math.cos(toRadians(secondLatitude))
		* Math.sin(longitudeDelta / 2) ** 2
	return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const readCoordinates = (location) => ({
	latitude: location?.coordinates?.[1] ?? DEFAULT_LATITUDE,
	longitude: location?.coordinates?.[0] ?? DEFAULT_LONGITUDE,
})

const normalizeBarangayCode = (value) => (
	String(value || 'UNSPECIFIED')
		.trim()
		.toUpperCase()
		.replace(/^BARANGAY\s+/, '')
		.replace(/\s+/g, '-')
)

const barangayNameFromCode = (code) => (
	String(code || 'Unspecified')
		.toLowerCase()
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
)

module.exports = {
	DEFAULT_LATITUDE,
	DEFAULT_LONGITUDE,
	barangayNameFromCode,
	distanceInMeters,
	getAreaCoordinates,
	isValidCoordinates,
	normalizeBarangayCode,
	point,
	readCoordinates,
}
