import { useEffect, useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { patrolBarangayReferences } from './patrolReferenceCenters'

export default function usePatrolDraftCoverage(draft, type, mode) {
  const [result, setResult] = useState(null)
  const key = JSON.stringify([type, mode, draft.coverageType, draft.barangay, draft.routePoints])
  useEffect(() => {
    let active = true
    const [kind, travelMode, coverageType, barangay, points] = JSON.parse(key)
    const load = async () => {
      if (kind === 'area' && coverageType === 'barangay' && barangay) {
        const reference = patrolBarangayReferences.find(a => a.name === `Barangay ${barangay}`)?.referenceCenter || {}
        try {
          const data = await apiRequest('/api/patrol/boundaries')
          const geometry = data.features?.find(f => f.properties?.barangay === barangay)?.geometry || null
          if (active) setResult({ key, ...reference, geometry, boundarySource: data.attribution, message: geometry ? data.attribution : 'Boundary unavailable. Reference location only; outside-coverage alerts cannot be enforced.' })
        } catch { if (active) setResult({ key, ...reference, geometry: null, message: 'Boundary unavailable. Reference location only; outside-coverage alerts cannot be enforced.' }) }
      } else if (kind === 'route' && points?.length >= 2) {
        try {
          const route = await apiRequest('/api/patrol/directions', { method: 'POST', body: JSON.stringify({ points, mode: travelMode }) })
          if (active) setResult({ key, geometry: route.available ? route.geometry : travelMode === 'walk' ? { type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude]) } : null,
            roadDirections: Boolean(route.available), message: route.available ? 'Directions loaded. Coverage follows this saved path.' : travelMode === 'walk' ? 'Manual foot path. Place points at every walkway turn; coverage follows the selected path.' : 'Road directions unavailable. Route warnings cannot be enforced until a valid road route is saved.' })
        } catch { if (active) setResult({ key, geometry: travelMode === 'walk' ? { type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude]) } : null, roadDirections: false,
          message: travelMode === 'walk' ? 'Walking directions unavailable. Plot the actual walkway and every turn.' : 'Road directions unavailable. Route warnings cannot be enforced until a valid road route is saved.' }) }
      }
    }
    void load()
    return () => { active = false }
  }, [key])
  const needsLoad = type === 'route' ? draft.routePoints.length >= 2 : draft.coverageType === 'barangay' && draft.barangay
  return result?.key === key ? { ...result, loading: false } : { loading: Boolean(needsLoad), message: needsLoad ? 'Loading coverage…' : '' }
}
