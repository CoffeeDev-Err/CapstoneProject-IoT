import { useEffect, useMemo, useState } from 'react'
import { useCachedPageData } from './useCachedPageData'
import { getReportsList } from '../services/operations'
import { requestErrorMessage } from '../utils/requestFeedback'

// Periods have separate session entries. Revisions refresh those entries rather
// than discarding successful results or adding another copy to the cache.
export function useAnalyticsReports({ from, to, reportsRevision, retry }) {
  const queryKey = JSON.stringify([from, to])
  const request = useMemo(() => ({ from, to, reportsRevision, retry }), [from, to, reportsRevision, retry])
  const [reports, setReports, hasData] = useCachedPageData(`analytics:${queryKey}`, [])
  const [outcome, setOutcome] = useState({ request: null, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    getReportsList({ from, to, cabaganOnly: true, signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      setReports(data)
      setOutcome({ request, error: '' })
    }).catch((error) => {
      if (controller.signal.aborted) return
      setOutcome({ request, error: requestErrorMessage(error, { action: 'load analytics' }) })
    })
    return () => controller.abort()
  }, [from, to, request, setReports])

  return {
    reports, hasData,
    pending: outcome.request !== request,
    error: outcome.request === request ? outcome.error : '',
  }
}
