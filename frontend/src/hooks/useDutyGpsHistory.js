import { useCallback, useMemo, useState } from 'react'
import { useCachedPageData } from './useCachedPageData'
import { useCachedRequest } from './useCachedRequest'
import { getDutyGpsHistory } from '../services/personnel'
import { phtDate } from '../utils/dutyGpsHistory'

export function useDutyGpsHistory(personnelId) {
  const [selection, setSelection] = useCachedPageData(`gps-history:selection:${personnelId}`, {
    date: phtDate(), deploymentId: '', view: 'hourly', hour: '', roadMatch: false,
  })
  const [revision, setRevision] = useState(0)
  const { date, deploymentId, view, hour, roadMatch } = selection
  const requestedHour = view === 'detailed' ? hour : ''
  const query = useMemo(() => ({ personnelId, date, deploymentId, view, hour: requestedHour, roadMatch }),
    [personnelId, date, deploymentId, view, requestedHour, roadMatch])
  const load = useCallback(async ({ signal }) => {
    let data = await getDutyGpsHistory({ ...query, signal })
    if (signal.aborted) return null
    const points = [...data.points]
    // Cache only the complete trace, never the first page of a long duty.
    while (data.next_cursor) {
      const page = await getDutyGpsHistory({ ...query, deploymentId: data.duty.id, cursor: data.next_cursor, signal })
      if (signal.aborted) return null
      points.push(...page.points)
      data = { ...data, next_cursor: page.next_cursor }
    }
    return { ...data, points }
  }, [query])
  const state = useCachedRequest(`gps-history:data:${JSON.stringify(query)}`, load, {
    revision, action: 'load personnel GPS history',
  })
  const updateSelection = useCallback(patch => setSelection(previous => ({ ...previous, ...patch })), [setSelection])
  const retry = useCallback(() => setRevision(value => value + 1), [])
  return { ...state, selection, updateSelection, retry, loading: !state.hasData && state.pending }
}
