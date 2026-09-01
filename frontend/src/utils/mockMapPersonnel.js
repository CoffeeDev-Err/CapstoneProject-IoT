const MOCK_MAP_PERSONNEL_COUNT = 96
const MOCK_MAP_UPDATE_INTERVAL_MS = 10_000

const CLUSTER_CENTERS = [
  [17.4104, 121.8008],
  [17.3952, 121.8295],
  [17.3758, 121.8138],
  [17.4062, 121.8554],
  [17.3655, 121.8462],
  [17.4246, 121.7698],
  [17.3868, 121.7808],
  [17.3998, 121.8742],
]

const MOVEMENT_PATH = [
  [0, 0],
  [0.00016, 0.00010],
  [0.00028, 0],
  [0.00014, -0.00012],
]

export const isDevelopmentMapPreviewEnabled = (
  search = '',
  isDevelopment = import.meta.env.DEV,
) => {
  if (!isDevelopment) return false
  const value = new URLSearchParams(search).get('mockMap')?.trim().toLowerCase()
  return ['1', 'true', 'cluster', 'clusters'].includes(value)
}

export const createDevelopmentMapPersonnel = ({
  tick = 0,
  recordedAt = new Date(0).toISOString(),
} = {}) => {
  const movement = MOVEMENT_PATH[Math.abs(tick) % MOVEMENT_PATH.length]

  return Array.from({ length: MOCK_MAP_PERSONNEL_COUNT }, (_, index) => {
    const clusterIndex = index % CLUSTER_CENTERS.length
    const positionInCluster = Math.floor(index / CLUSTER_CENTERS.length)
    const [centerLatitude, centerLongitude] = CLUSTER_CENTERS[clusterIndex]
    const angle = (positionInCluster / 12) * Math.PI * 2
    const radius = 0.000035 + positionInCluster * 0.000012
    const number = String(index + 1).padStart(3, '0')

    return {
      id: `mock-map-personnel-${number}`,
      badge: `MAP-${number}`,
      name: `Map Preview Officer ${number}`,
      rank: 'Patrolman',
      status: index % 11 === 0 ? 'Responding' : 'On Duty',
      latitude: centerLatitude + Math.sin(angle) * radius + movement[0],
      longitude: centerLongitude + Math.cos(angle) * radius + movement[1],
      speed: 6,
      batteryLevel: 70 + (index % 30),
      locationName: `Mock cluster ${clusterIndex + 1}`,
      locationRecordedAt: recordedAt,
      lastUpdated: recordedAt,
      locationStatus: 'current',
      isOnDuty: true,
      isInsideCabagan: index % 31 !== 0,
      isLocationStale: false,
      isVisibleOnMap: true,
      isMockPersonnel: true,
      emergencyActive: index % 29 === 0,
      operationActive: index % 11 === 0,
    }
  })
}

export {
  MOCK_MAP_PERSONNEL_COUNT,
  MOCK_MAP_UPDATE_INTERVAL_MS,
}
