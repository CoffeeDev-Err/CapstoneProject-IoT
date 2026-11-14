import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCachedPageData } from '../../hooks/useCachedPageData'
import { useCachedRequest } from '../../hooks/useCachedRequest'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getDeploymentHistoryPage, getManageableDeployments } from '../../services/operations'

const EMPTY_ASSIGNMENTS = []
const loadAssignments = () => getManageableDeployments()

export function useDeploymentData({ listOnly, liveDeployments, historyPage, historyLimit, historySearch, setHistoryPage }) {
  const [revision, setRevision] = useCachedPageData('deployments:revision', 0)
  const [historyTotal, setHistoryTotal] = useCachedPageData('deployments:history-total', 0)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const deploymentVersion = useMemo(() => ({ revision, liveDeployments }), [revision, liveDeployments])
  const assignments = useCachedRequest('deployments', loadAssignments, {
    revision: deploymentVersion, fallback: EMPTY_ASSIGNMENTS, action: 'load deployments',
  })
  const search = historySearch.trim()
  const debouncedSearch = useDebouncedValue(search, 250)
  const queryKey = JSON.stringify([historyPage, historyLimit, search])
  const loadHistory = useCallback(async ({ signal }) => {
    const result = await getDeploymentHistoryPage({ page: historyPage, limit: historyLimit, search, signal })
    if (!signal.aborted) setHistoryTotal(result.historyTotal)
    return result
  }, [historyPage, historyLimit, search, setHistoryTotal])
  const historyVersion = useMemo(() => ({ deploymentVersion, historyRefresh }), [deploymentVersion, historyRefresh])
  const history = useCachedRequest(`deployments:history:${queryKey}`, loadHistory, {
    enabled: listOnly && search === debouncedSearch, revision: historyVersion, action: 'load deployment history',
  })
  useEffect(() => {
    if (history.hasData && !history.pending && !history.error && search === debouncedSearch
      && historyPage > history.data.pagination.totalPages) {
      setHistoryPage(Math.max(1, history.data.pagination.totalPages))
    }
  }, [debouncedSearch, history.data, history.error, history.hasData, history.pending, historyPage, search, setHistoryPage])
  const refreshHistory = useCallback(() => setHistoryRefresh(value => value + 1), [])
  const invalidateDeployments = useCallback(() => setRevision(value => value + 1), [setRevision])
  return { assignments: assignments.data, setAssignments: assignments.setData, hasAssignments: assignments.hasData,
    isDeploymentsLoading: assignments.pending, deploymentsError: assignments.error,
    history: history.data?.data || EMPTY_ASSIGNMENTS, hasHistory: history.hasData,
    historyLoading: !history.hasData && (history.pending || search !== debouncedSearch),
    historyError: history.error, historyTotal,
    historyPagination: history.data?.pagination || { page: historyPage, limit: historyLimit, total: 0, totalPages: 1 },
    refreshHistory, invalidateDeployments }
}
