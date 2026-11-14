import { useEffect, useMemo, useState } from 'react'
import { useCachedPageData } from './useCachedPageData'
import { requestErrorMessage } from '../utils/requestFeedback'

// Only successful responses enter the authenticated, memory-only page cache.
// A new query never borrows another query's rows, and cancelled requests cannot
// overwrite a newer response even when the underlying API ignores cancellation.
export function useCachedRequest(key, load, { enabled = true, revision = 0, fallback = null, action = 'load records' } = {}) {
  const [data, setData, hasData] = useCachedPageData(key, fallback)
  const request = useMemo(() => ({ key, load, enabled, revision }), [key, load, enabled, revision])
  const [outcome, setOutcome] = useState({ request: null, error: '' })
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load({ signal: controller.signal })
    }).then(result => {
      if (controller.signal.aborted) return
      setData(result)
      setOutcome({ request, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setOutcome({ request, error: requestErrorMessage(error, { action }) })
    })
    return () => controller.abort()
  }, [action, enabled, load, request, setData])
  return { data, setData, hasData, pending: enabled && outcome.request !== request,
    error: enabled && outcome.request === request ? outcome.error : '' }
}
