import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchReportPage } from '../../services/operationsApi';
import type { PoliceReport } from '../../types/operations';
import { mergeById } from '../operations/operationalState';

export type ReportCategory = 'all' | 'incident' | 'routine';
export type ReportDateRange = { from?: string; to?: string };

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
  const [reportsError, setReportsError] = useState('');
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('all');
  const [reportDateRange, setReportDateRange] = useState<ReportDateRange>({});
  const reportRequestId = useRef(0);

  const resetReportPagination = useCallback(() => {
    reportRequestId.current += 1;
    setIsReportsLoading(false);
    setIsReportsLoadingMore(false);
    setReportCursor(null);
    setReportsHasMore(false);
    setReportsError('');
  }, []);

  const refreshReports = useCallback(async (
    category: ReportCategory,
    dateRange: ReportDateRange = {},
  ) => {
    if (!currentPersonnelId) return;
    const requestId = ++reportRequestId.current;
    setReportCategory(category);
    setReportDateRange(dateRange);
    setIsReportsLoading(true);
    setReportsError('');
    setReportCursor(null);
    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category,
        ...dateRange,
      }, token);
      if (requestId !== reportRequestId.current) return;
      setReports(payload.data);
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
    } catch (error) {
      if (requestId === reportRequestId.current) {
        setReports([]);
        setReportsHasMore(false);
        setReportsError(error instanceof Error
          ? error.message
          : 'Unable to load reports. Check your connection and try again.');
      }
      throw error;
    } finally {
      if (requestId === reportRequestId.current) setIsReportsLoading(false);
    }
  }, [currentPersonnelId, setReports, token]);

  const loadMoreReports = useCallback(async () => {
    if (!currentPersonnelId || !reportCursor || isReportsLoadingMore) return;
    setIsReportsLoadingMore(true);
    setReportsError('');
    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category: reportCategory,
        cursor: reportCursor,
        ...reportDateRange,
      }, token);
      setReports((items) => mergeById(items, payload.data));
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
    } catch (error) {
      setReportsError(error instanceof Error
        ? error.message
        : 'Unable to load previous reports. Check your connection and try again.');
      throw error;
    } finally {
      setIsReportsLoadingMore(false);
    }
  }, [currentPersonnelId, isReportsLoadingMore, reportCategory, reportCursor, reportDateRange, setReports, token]);

  return {
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
    refreshReports,
    loadMoreReports,
    resetReportPagination,
  };
}
