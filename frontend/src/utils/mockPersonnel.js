const MOCK_RANKS = [
  'Patrolman',
  'Police Corporal',
  'Police Staff Sergeant',
  'Police Master Sergeant',
  'Police Chief Master Sergeant',
]

const DEVELOPMENT_MOCK_PERSONNEL = import.meta.env.DEV
  ? Array.from({ length: 100 }, (_, index) => {
      const number = String(index + 1).padStart(3, '0')

      return {
        id: `mock-personnel-${number}`,
        badge: `MOCK-${number}`,
        name: `Mock Personnel ${number}`,
        rank: MOCK_RANKS[index % MOCK_RANKS.length],
        status: 'Off Duty',
        isOnDuty: false,
        isInsideCabagan: true,
        isLocationStale: false,
        isVisibleOnMap: false,
        isMockPersonnel: true,
        locationName: 'Search performance test record',
      }
    })
  : []

export const appendDevelopmentMockPersonnel = (personnel = []) => {
  if (!import.meta.env.DEV) return personnel

  const existingIds = new Set(personnel.map((member) => member.id))
  return [
    ...personnel,
    ...DEVELOPMENT_MOCK_PERSONNEL.filter((member) => !existingIds.has(member.id)),
  ]
}
