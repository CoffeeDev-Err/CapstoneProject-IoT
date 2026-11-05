export function mergePersonnelLocations(previous, incoming, now = Date.now()) {
  const previousById = new Map(previous.map((member) => [member.id, member]))
  // Keep the authorized collection and duty state while preventing older fixes from winning.
  return incoming.map((member) => {
    const latest = previousById.get(member.id)
    const latestTime = Date.parse(latest?.locationRecordedAt || '')
    const incomingTime = Date.parse(member.locationRecordedAt || '')
    if (!latest || latest.source !== 'gps' || member.source !== 'gps'
      || !Number.isFinite(latestTime) || !Number.isFinite(incomingTime)
      || incomingTime >= latestTime) return member
    const age = Math.max(0, Math.floor((now - latestTime) / 1000))
    const stale = now - latestTime > (member.locationStaleAfterSeconds ?? 120) * 1000
      || latestTime - now > 300_000
    const hasCoordinates = Number.isFinite(latest.latitude) && Number.isFinite(latest.longitude)
    return {
      ...member,
      latitude: latest.latitude,
      longitude: latest.longitude,
      locationRecordedAt: latest.locationRecordedAt,
      locationReceivedAt: latest.locationReceivedAt,
      lastUpdated: latest.lastUpdated,
      locationName: stale ? 'GPS location unavailable' : latest.locationName,
      lastKnownLocationName: latest.lastKnownLocationName || latest.locationName,
      speed: latest.speed,
      accuracy: latest.accuracy,
      satellites: latest.satellites,
      lastMovedAt: latest.lastMovedAt,
      isInsideCabagan: stale ? null : latest.isInsideCabagan,
      isLocationStale: stale,
      locationAgeSeconds: age,
      locationStatus: !hasCoordinates ? 'unavailable' : stale ? 'stale' : 'current',
      isVisibleOnMap: member.isOnDuty === true && hasCoordinates,
    }
  })
}
