import { routeBearing, routeDistanceMeters, validRouteCoordinate } from './reportRouteTrace'

export const phtDate = (time = Date.now()) => new Date(time + 8 * 3600_000).toISOString().slice(0, 10)
export const historyTime = value => value ? new Date(value).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
}) : 'Unavailable'
export const hourLabel = hour => `${new Date(hour.from).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })} – ${new Date(hour.to).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}`
export const patrolLabel = duty => ({ point: 'Fixed post', area: 'Area patrol', route: 'Route patrol' }[duty?.deploymentType] || 'Patrol')
  + (duty?.patrolMode ? ` · ${{ walk: 'Walk Patrol', car: 'Car Patrol', motorcycle: 'Motorcycle Patrol' }[duty.patrolMode] || duty.patrolMode}` : '')

export const checkpointDetails = hour => {
  const point = hour.checkpoint
  if (!point) return `${hourLabel(hour)}: No GPS reading`
  return `Hour ${hour.hour + 1}: ${hourLabel(hour)}. GPS time: ${historyTime(point.recorded_at)} PHT. Location: ${point.location_name || 'Coordinates'} (${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}). Accuracy: ${point.accuracy == null ? 'not recorded' : `${point.accuracy} m`}. Satellites: ${point.satellites ?? 'not recorded'}. Speed: ${point.speed == null ? 'not recorded' : `${point.speed} km/h`}. Battery: ${point.battery_level == null ? 'not recorded' : `${point.battery_level}%`}.`
}

export const groupCheckpoints = hours => {
  const groups = []
  hours.forEach(hour => {
    if (!validRouteCoordinate(hour.checkpoint)) return
    const group = groups.find(items => routeDistanceMeters(items[0].checkpoint, hour.checkpoint) <= 5)
    if (group) group.push(hour)
    else groups.push([hour])
  })
  return groups
}

export const hourlySequenceFeatures = hours => hours.slice(1).flatMap((hour, index) => {
  const previous = hours[index]
  if (hour.hour !== previous.hour + 1 || !validRouteCoordinate(previous.checkpoint) || !validRouteCoordinate(hour.checkpoint)) return []
  const first = previous.checkpoint
  const last = hour.checkpoint
  const a = [Number(first.longitude), Number(first.latitude)]
  const b = [Number(last.longitude), Number(last.latitude)]
  if (a[0] === b[0] && a[1] === b[1]) return []
  return [
    { type: 'Feature', properties: { kind: 'hourly_sequence' }, geometry: { type: 'LineString', coordinates: [a, b] } },
    { type: 'Feature', properties: { kind: 'hourly_arrow', bearing: routeBearing(first, last) - 90 }, geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] } },
  ]
})
