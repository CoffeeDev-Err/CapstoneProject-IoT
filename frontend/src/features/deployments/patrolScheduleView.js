export const patrolClock = value => Number.isFinite(+new Date(value))
  ? new Date(value).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '—'
export const blockOffset = (blocks, index) => blocks.slice(0, index).reduce((sum, block) => sum + Number(block.durationMinutes), 0)
export const blockTimeLabel = (start, block, offset = block.offsetMinutes || 0) =>
  `${patrolClock(+new Date(start) + offset * 60000)} – ${patrolClock(+new Date(start) + (offset + Number(block.durationMinutes)) * 60000)}`
export const patrolModeLabel = mode => ({ walk: 'Foot Patrol', motorcycle: 'Motorcycle Patrol', car: 'Car Patrol' })[mode] || 'Area Patrol'
export const emptyPatrolBlock = (remaining = 120) => ({ label: '', coverageType: 'custom', durationMinutes: Number.isFinite(remaining) && remaining >= 15 ? Math.min(120, remaining) : 120, radiusMeters: 200, routeCorridorMeters: 100, routePoints: [], barangay: '' })
export const moveItem = (items, from, to) => {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}
export const hasBlockCoverage = (block, type) => Boolean(block.label?.trim() && (type === 'route'
  ? block.routePoints?.length >= 2 : block.coverageType === 'barangay' ? block.barangay
    : Number.isFinite(block.latitude) && Number.isFinite(block.longitude)))
export const circleGeometry = (latitude, longitude, radiusMeters) => ({ type: 'Polygon', coordinates: [Array.from({ length: 65 }, (_, i) => {
  const angle = i / 64 * 2 * Math.PI
  return [longitude + Math.cos(angle) * radiusMeters / (111320 * Math.cos(latitude * Math.PI / 180)), latitude + Math.sin(angle) * radiusMeters / 111320]
})] })
export const routeIsEnforced = (block, mode) => block.geometry?.type === 'LineString' && (mode === 'walk' || block.roadDirections === true)
export const blockCoverageSummary = (block, type) => type === 'route'
  ? `${block.routePoints?.length || 0} points · ${block.routeCorridorMeters ?? 100} m corridor each side`
  : block.coverageType === 'barangay' ? `Whole Barangay · ${block.barangay || 'Not selected'}` : `Custom Area · ${block.radiusMeters} m radius`
