import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchTaskHistoryPage } from '../../services/operationsApi';
import type { OperationalTask } from '../../types/operations';
import { isActiveTask, mergeById } from '../operations/operationalState';

type TaskHistoryPaginationOptions = {
  currentPersonnelId: string;
  setTasks: Dispatch<SetStateAction<OperationalTask[]>>;
  token?: string | null;
};

export function useTaskHistoryPagination({
  currentPersonnelId,
  setTasks,
  token,
}: TaskHistoryPaginationOptions) {
  const [isTaskHistoryLoading, setIsTaskHistoryLoading] = useState(false);
  const [isTaskHistoryLoadingMore, setIsTaskHistoryLoadingMore] = useState(false);
  const [taskHistoryHasMore, setTaskHistoryHasMore] = useState(false);
  const [taskHistoryCursor, setTaskHistoryCursor] = useState<string | null>(null);
  const taskHistoryRequestId = useRef(0);

  const resetTaskHistoryPagination = useCallback(() => {
    taskHistoryRequestId.current += 1;
    setTaskHistoryCursor(null);
    setTaskHistoryHasMore(false);
  }, []);

  const refreshTaskHistory = useCallback(async () => {
    if (!currentPersonnelId) return;
    const requestId = ++taskHistoryRequestId.current;
    setIsTaskHistoryLoading(true);
    setTaskHistoryCursor(null);
    try {
      const payload = await fetchTaskHistoryPage({ personnelId: currentPersonnelId }, token);
      if (requestId !== taskHistoryRequestId.current) return;
      setTasks((items) => mergeById(items.filter(isActiveTask), payload.data));
      setTaskHistoryCursor(payload.pagination.nextCursor);
      setTaskHistoryHasMore(payload.pagination.hasNextPage);
    } finally {
      if (requestId === taskHistoryRequestId.current) setIsTaskHistoryLoading(false);
    }
  }, [currentPersonnelId, setTasks, token]);

  const loadMoreTaskHistory = useCallback(async () => {
    if (!currentPersonnelId || !taskHistoryCursor || isTaskHistoryLoadingMore) return;
    setIsTaskHistoryLoadingMore(true);
    try {
      const payload = await fetchTaskHistoryPage({
        personnelId: currentPersonnelId,
        cursor: taskHistoryCursor,
      }, token);
      setTasks((items) => mergeById(items, payload.data));
      setTaskHistoryCursor(payload.pagination.nextCursor);
      setTaskHistoryHasMore(payload.pagination.hasNextPage);
    } finally {
      setIsTaskHistoryLoadingMore(false);
    }
  }, [currentPersonnelId, isTaskHistoryLoadingMore, setTasks, taskHistoryCursor, token]);

  return {
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    refreshTaskHistory,
    loadMoreTaskHistory,
    resetTaskHistoryPagination,
  };
}
