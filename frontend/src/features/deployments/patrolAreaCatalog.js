import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'

export const DEFAULT_PATROL_CENTER = Object.freeze({ latitude: 17.4239, longitude: 121.7681 })

const knownCenters = {
  CENTRO: { latitude: 17.4239, longitude: 121.7681 },
  CUBAG: { latitude: 17.4272, longitude: 121.7658 },
  GARITA: { latitude: 17.4148, longitude: 121.7762 },
  'SAN-JUAN': { latitude: 17.4192, longitude: 121.7546 },
}

const barangayCodeFor = (name) => name.toUpperCase().replace(/\s+/g, '-')

const routeArea = (id, name, coverageBarangays = [], referenceCenter = DEFAULT_PATROL_CENTER) => ({
  id,
  name,
  category: 'route',
  coverageBarangays,
  defaultDeploymentType: 'route',
  referenceCenter,
})

export const patrolAreaCatalog = [
  ...CABAGAN_BARANGAYS.map((barangay) => {
    const code = barangayCodeFor(barangay)
    return {
    id: `barangay-${code.toLowerCase()}`,
    name: `Barangay ${barangay}`,
    category: 'barangay',
    coverageBarangays: [code],
    defaultDeploymentType: 'area',
    referenceCenter: knownCenters[code] || DEFAULT_PATROL_CENTER,
  }}),
  {
    id: 'cabagan-public-market-zone',
    name: 'Cabagan Public Market Zone',
    category: 'zone',
    coverageBarangays: ['CENTRO'],
    defaultDeploymentType: 'point',
    referenceCenter: { latitude: 17.4272, longitude: 121.7658 },
  },
  {
    id: 'municipal-hall-perimeter',
    name: 'Municipal Hall Perimeter',
    category: 'zone',
    coverageBarangays: ['CENTRO'],
    defaultDeploymentType: 'point',
    referenceCenter: { latitude: 17.4239, longitude: 121.7681 },
  },
  routeArea('barangay-centro-route', 'Barangay Centro Route', ['CENTRO'], {
    latitude: 17.4248,
    longitude: 121.7669,
  }),
  routeArea('cabagan-santa-maria-road', 'Cabagan-Santa Maria Road'),
  routeArea('cabagan-tumauini-road', 'Cabagan-Tumauini Road'),
  routeArea('maharlika-highway-northbound', 'Maharlika Highway Northbound'),
  routeArea('maharlika-highway-southbound', 'Maharlika Highway Southbound'),
  routeArea('national-highway-checkpoint-north', 'National Highway Checkpoint North'),
  routeArea('national-highway-checkpoint-south', 'National Highway Checkpoint South'),
  routeArea('highway-checkpoint-north', 'Highway Checkpoint North'),
  routeArea('highway-checkpoint-south', 'Highway Checkpoint South'),
  routeArea('school-safety-patrol-route', 'School Safety Patrol Route'),
  routeArea('bridge-approach-patrol-zone', 'Bridge Approach Patrol Zone'),
]

export const patrolAreas = patrolAreaCatalog.map((area) => area.name)

export const findPatrolArea = (value) => {
  const lookup = String(value || '').trim().toLocaleLowerCase('en-PH')
  return patrolAreaCatalog.find((area) => (
    area.id.toLocaleLowerCase('en-PH') === lookup
    || area.name.toLocaleLowerCase('en-PH') === lookup
  )) || null
}

export const coverageLabelFor = (area) => {
  if (!area || area.coverageBarangays.length === 0) return 'Multiple barangays along this route'
  const names = area.coverageBarangays.map((code) => (
    CABAGAN_BARANGAYS.find((barangay) => barangayCodeFor(barangay) === code) || code
  ))
  return names.length === 1 ? `Barangay ${names[0]}` : names.map((name) => `Barangay ${name}`).join(', ')
}

export const patrolAreaGroups = [
  { id: 'barangay', label: 'Barangays' },
  { id: 'zone', label: 'Zones and landmarks' },
  { id: 'route', label: 'Roads and routes' },
]
