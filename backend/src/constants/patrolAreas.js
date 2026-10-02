const { CABAGAN_BARANGAYS, normalizeBarangayLookup } = require('./cabaganBarangays')

const DEFAULT_REFERENCE_CENTER = Object.freeze({ latitude: 17.4239, longitude: 121.7681 })

const KNOWN_REFERENCE_CENTERS = Object.freeze({
	CENTRO: { latitude: 17.4239, longitude: 121.7681 },
	CUBAG: { latitude: 17.4272, longitude: 121.7658 },
	GARITA: { latitude: 17.4148, longitude: 121.7762 },
	'SAN-JUAN': { latitude: 17.4192, longitude: 121.7546 },
})

const SPECIAL_PATROL_AREAS = [
	{
		id: 'cabagan-public-market-zone',
		name: 'Cabagan Public Market Zone',
		category: 'zone',
		coverageBarangayCodes: ['CENTRO'],
		defaultDeploymentType: 'point',
		referenceCenter: { latitude: 17.4272, longitude: 121.7658 },
	},
	{
		id: 'municipal-hall-perimeter',
		name: 'Municipal Hall Perimeter',
		category: 'zone',
		coverageBarangayCodes: ['CENTRO'],
		defaultDeploymentType: 'point',
		referenceCenter: { latitude: 17.4239, longitude: 121.7681 },
	},
	{
		id: 'barangay-centro-route',
		name: 'Barangay Centro Route',
		category: 'route',
		coverageBarangayCodes: ['CENTRO'],
		defaultDeploymentType: 'route',
		referenceCenter: { latitude: 17.4248, longitude: 121.7669 },
	},
	...[
		['cabagan-santa-maria-road', 'Cabagan-Santa Maria Road'],
		['cabagan-tumauini-road', 'Cabagan-Tumauini Road'],
		['maharlika-highway-northbound', 'Maharlika Highway Northbound'],
		['maharlika-highway-southbound', 'Maharlika Highway Southbound'],
		['national-highway-checkpoint-north', 'National Highway Checkpoint North'],
		['national-highway-checkpoint-south', 'National Highway Checkpoint South'],
		['highway-checkpoint-north', 'Highway Checkpoint North'],
		['highway-checkpoint-south', 'Highway Checkpoint South'],
		['school-safety-patrol-route', 'School Safety Patrol Route'],
		['bridge-approach-patrol-zone', 'Bridge Approach Patrol Zone'],
	].map(([id, name]) => ({
		id,
		name,
		category: 'route',
		coverageBarangayCodes: [],
		defaultDeploymentType: 'route',
		referenceCenter: DEFAULT_REFERENCE_CENTER,
	})),
]

const PATROL_AREAS = Object.freeze([
	...CABAGAN_BARANGAYS.map((barangay) => ({
		id: `barangay-${barangay.code.toLowerCase()}`,
		name: `Barangay ${barangay.name}`,
		category: 'barangay',
		coverageBarangayCodes: [barangay.code],
		defaultDeploymentType: 'area',
		referenceCenter: KNOWN_REFERENCE_CENTERS[barangay.code] || DEFAULT_REFERENCE_CENTER,
	})),
	...SPECIAL_PATROL_AREAS,
])

const patrolAreaById = new Map(PATROL_AREAS.map((area) => [area.id, area]))
const patrolAreaByName = new Map(PATROL_AREAS.map((area) => [area.name.toLocaleLowerCase('en-PH'), area]))

const findPatrolArea = (value) => {
	const lookup = String(value || '').trim()
	if (!lookup) return null
	return patrolAreaById.get(lookup.toLowerCase())
		|| patrolAreaByName.get(lookup.toLocaleLowerCase('en-PH'))
		|| null
}

const coverageLabelFor = (area) => {
	if (!area) return 'Coverage unavailable'
	if (area.coverageBarangayCodes.length === 0) return 'Route coverage across multiple barangays'
	const names = area.coverageBarangayCodes.map((code) => (
		CABAGAN_BARANGAYS.find((barangay) => barangay.code === normalizeBarangayLookup(code))?.name || code
	))
	return names.length === 1 ? `Barangay ${names[0]}` : names.map((name) => `Barangay ${name}`).join(', ')
}

module.exports = {
	DEFAULT_REFERENCE_CENTER,
	PATROL_AREAS,
	coverageLabelFor,
	findPatrolArea,
}
