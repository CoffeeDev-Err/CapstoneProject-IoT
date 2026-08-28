import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchReportPage } from '../../services/operationsApi';
import type { PoliceReport } from '../../types/operations';
import { mergeById } from '../operations/operationalState';

export type ReportCategory = 'all' | 'incident' | 'routine';

type ReportPaginationOptions = {
  currentPersonnelId: string;
  setReports: Dispatch<SetStateAction<PoliceReport[]>>;
  token?: string | null;
};

export function useReportPagination({
  currentPersonnelId,
  setReports,
  token,
}: ReportPaginationOptions) {
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const [isReportsLoadingMore, setIsReportsLoadingMore] = useState(false);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('all');
  const reportRequestId = useRef(0);

  const resetReportPagination = useCallback(() => {
    reportRequestId.current += 1;
    setReportCursor(null);
    setReportsHasMore(false);
  }, []);

  const refreshReports = useCallback(async (category: ReportCategory) => {
    if (!currentPersonnelId) return;
    const requestId = ++reportRequestId.current;
    setReportCategory(category);
    setIsReportsLoading(true);
    setReportCursor(null);
    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category,
      }, token);
      if (requestId !== reportRequestId.current) return;
      setReports(payload.data);
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
    } finally {
      if (requestId === reportRequestId.current) setIsReportsLoading(false);
    }
  }, [currentPersonnelId, setReports, token]);

  const loadMoreReports = useCallback(async () => {
    if (!currentPersonnelId || !reportCursor || isReportsLoadingMore) return;
    setIsReportsLoadingMore(true);
    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category: reportCategory,
        cursor: reportCursor,
      }, token);
      setReports((items) => mergeById(items, payload.data));
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
    } finally {
      setIsReportsLoadingMore(false);
    }
  }, [currentPersonnelId, isReportsLoadingMore, reportCategory, reportCursor, setReports, token]);

  return {
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    refreshReports,
    loadMoreReports,
    resetReportPagination,
  };
}
