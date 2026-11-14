import { useCallback } from 'react'
import { useCachedPageData } from '../../hooks/useCachedPageData'
import { DEPLOYMENT_LIST_VIEWS } from './deploymentForm'

const INITIAL_STATE = { view: DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW, searches: {}, historyPage: 1, historyLimit: 10 }
export function useDeploymentListState() {
  const [state, setState] = useCachedPageData('deployments:list-state', INITIAL_STATE)
  const setView = useCallback(view => setState(previous => ({ ...previous, view })), [setState])
  const setSearch = useCallback(search => setState(previous => ({ ...previous,
    searches: { ...previous.searches, [previous.view]: search },
    historyPage: previous.view === 'history' ? 1 : previous.historyPage,
  })), [setState])
  const setHistoryPage = useCallback(historyPage => setState(previous => ({ ...previous, historyPage })), [setState])
  const setHistoryLimit = useCallback(historyLimit => setState(previous => ({ ...previous, historyLimit, historyPage: 1 })), [setState])
  return { activeDeploymentView: state.view, setActiveDeploymentView: setView,
    deploymentSearch: state.searches[state.view] || '', setDeploymentSearch: setSearch,
    historySearch: state.searches.history || '', historyPage: state.historyPage, historyLimit: state.historyLimit,
    setHistoryPage, setHistoryLimit }
}
