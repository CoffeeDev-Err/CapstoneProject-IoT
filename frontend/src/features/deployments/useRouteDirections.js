import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../services/apiClient'

export default function useRouteDirections(paths, mode) {
  const cache = useRef(new Map())
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify([mode, paths.map(points => points.map(({ latitude, longitude }) => ({ latitude, longitude })))])
  useEffect(() => {
    const controller = new AbortController()
    const [travelMode, routes] = JSON.parse(key)
    const timer = setTimeout(async () => {
      const results = await Promise.all(routes.map(async points => {
        if (points.length < 2) return { available: false }
        const routeKey = JSON.stringify([travelMode, points])
        if (cache.current.has(routeKey)) return cache.current.get(routeKey)
        try {
          const route = await apiRequest('/api/patrol/directions', { method: 'POST', signal: controller.signal, body: JSON.stringify({ mode: travelMode, points }) })
          const valid = route.available === true && route.geometry?.type === 'LineString' && route.geometry.coordinates?.length >= 2
          const value = valid ? route : { available: false }
          if (!controller.signal.aborted) cache.current.set(routeKey, value)
          return value
        } catch { return { available: false } }
      }))
      if (!controller.signal.aborted) setResult({ key, revision, results })
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key, revision])
  const ready = result?.key === key && result?.revision === revision
  const needed = paths.some(points => points.length >= 2)
  return { results: ready ? result.results : paths.map(() => ({ available: false })), loading: needed && !ready, retry: () => { cache.current.clear(); setRevision(value => value + 1) } }
}
