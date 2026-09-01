import { useEffect, useMemo, useState } from 'react'
import {
  createDevelopmentMapPersonnel,
  isDevelopmentMapPreviewEnabled,
  MOCK_MAP_UPDATE_INTERVAL_MS,
} from '../utils/mockMapPersonnel'

export const useDevelopmentMapPersonnel = (search = '') => {
  const enabled = isDevelopmentMapPreviewEnabled(search)
  const [previewUpdate, setPreviewUpdate] = useState(() => ({
    recordedAt: new Date().toISOString(),
    tick: 0,
  }))

  useEffect(() => {
    if (!enabled) return undefined

    const timer = window.setInterval(() => {
      setPreviewUpdate((current) => ({
        recordedAt: new Date().toISOString(),
        tick: current.tick + 1,
      }))
    }, MOCK_MAP_UPDATE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [enabled])

  const personnel = useMemo(
    () => enabled ? createDevelopmentMapPersonnel(previewUpdate) : [],
    [enabled, previewUpdate],
  )

  return { enabled, personnel }
}
