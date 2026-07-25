const DEFAULT_LATITUDE = 17.4239
const DEFAULT_LONGITUDE = 121.7681

const AREA_COORDINATES = {
	'Barangay Centro': { latitude: 17.4239, longitude: 121.7681 },
	'Barangay Cubag': { latitude: 17.4272, longitude: 121.7658 },
	'Barangay Garita': { latitude: 17.4148, longitude: 121.7762 },
	'Barangay San Juan': { latitude: 17.4192, longitude: 121.7546 },
	'Barangay Santa Maria': { latitude: 17.4843, longitude: 121.7574 },
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
	getAreaCoordinates,
	normalizeBarangayCode,
	point,
	readCoordinates,
}
