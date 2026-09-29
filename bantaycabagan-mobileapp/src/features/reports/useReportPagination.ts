import { requestErrorMessage } from '../../utils/requestFeedback';
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchReportPage } from '../../services/operationsApi';
import { loadCachedReports, saveCachedReports } from '../../services/offlineOperationsCache';
import type { PoliceReport } from '../../types/operations';
import { mergeById } from '../operations/operationalState';

export type ReportCategory = 'all' | 'incident' | 'routine';
export type ReportDateRange = { from?: string; to?: string };
export type ReportRefreshOptions = { cacheKey?: string; force?: boolean };

type ReportViewCacheEntry = {
  data: PoliceReport[];
  fetchedAt: number;
  hasMore: boolean;
  nextCursor: string | null;
  offline: boolean;
};

const REPORT_VIEW_CACHE_TTL_MS = 60_000;

const defaultViewCacheKey = (category: ReportCategory, dateRange: ReportDateRange) => (
  !dateRange.from && !dateRange.to
    ? `${category}:all`
    : `${category}:${dateRange.from || ''}:${dateRange.to || ''}`
);

export const filterCachedReports = (
  reports: PoliceReport[],
  category: ReportCategory,
  dateRange: ReportDateRange,
) => reports.filter((report) => {
  if (category === 'incident' && !report.is_incident) return false;
  if (category === 'routine' && report.is_incident) return false;
  const submittedAt = Date.parse(report.date_time);
  const from = dateRange.from ? Date.parse(dateRange.from) : null;
  const to = dateRange.to ? Date.parse(dateRange.to) : null;
  if (from !== null && Number.isFinite(from) && (!Number.isFinite(submittedAt) || submittedAt < from)) return false;
  if (to !== null && Number.isFinite(to) && (!Number.isFinite(submittedAt) || submittedAt > to)) return false;
  return true;
});

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
  const [isReportsOffline, setIsReportsOffline] = useState(false);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('all');
  const [reportDateRange, setReportDateRange] = useState<ReportDateRange>({});
  const reportRequestId = useRef(0);
  const reportViewCache = useRef(new Map<string, ReportViewCacheEntry>());
  const activeViewCacheKey = useRef('all:all');

  const resetReportPagination = useCallback(() => {
    reportRequestId.current += 1;
    reportViewCache.current.clear();
    activeViewCacheKey.current = 'all:all';
    setIsReportsLoading(false);
    setIsReportsLoadingMore(false);
    setReportCursor(null);
    setReportsHasMore(false);
    setReportsError('');
    setIsReportsOffline(false);
  }, []);

  const invalidateReportViews = useCallback(() => {
    reportViewCache.current.forEach((entry, key) => {
      reportViewCache.current.set(key, { ...entry, fetchedAt: 0 });
    });
  }, []);

  const refreshReports = useCallback(async (
    category: ReportCategory,
    dateRange: ReportDateRange = {},
    options: ReportRefreshOptions = {},
  ) => {
    if (!currentPersonnelId) return;
    const requestId = ++reportRequestId.current;
    const viewCacheKey = options.cacheKey || defaultViewCacheKey(category, dateRange);
    const exactCache = reportViewCache.current.get(viewCacheKey);
    const broadCache = reportViewCache.current.get('all:all');
    const fallbackData = !exactCache && broadCache
      ? filterCachedReports(broadCache.data, category, dateRange)
      : null;
    const hasVisibleCache = Boolean(exactCache || fallbackData);
    activeViewCacheKey.current = viewCacheKey;
    setReportCategory(category);
    setReportDateRange(dateRange);
    setReportsError('');
    if (exactCache) {
      setReports(exactCache.data);
      setReportCursor(exactCache.nextCursor);
      setReportsHasMore(exactCache.hasMore);
      setIsReportsOffline(exactCache.offline);
    } else if (fallbackData) {
      setReports(fallbackData);
      setReportCursor(null);
      setReportsHasMore(false);
      setIsReportsOffline(Boolean(broadCache?.offline));
    } else {
      setReportCursor(null);
      setReportsHasMore(false);
    }
    setIsReportsLoading(!hasVisibleCache);

    const exactCacheIsFresh = exactCache
      && !exactCache.offline
      && Date.now() - exactCache.fetchedAt < REPORT_VIEW_CACHE_TTL_MS;
    if (exactCacheIsFresh && !options.force) {
      setIsReportsLoading(false);
      return;
    }

    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category,
        ...dateRange,
      }, token);
      if (requestId !== reportRequestId.current) return;
      reportViewCache.current.set(viewCacheKey, {
        data: payload.data,
        fetchedAt: Date.now(),
        hasMore: payload.pagination.hasNextPage,
        nextCursor: payload.pagination.nextCursor,
        offline: false,
      });
      setReports(payload.data);
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
      setIsReportsOffline(false);
      void saveCachedReports(currentPersonnelId, payload.data).catch(() => undefined);
    } catch (error) {
      if (requestId === reportRequestId.current) {
        if (hasVisibleCache) {
          const visibleData = exactCache?.data || fallbackData || [];
          reportViewCache.current.set(viewCacheKey, {
            data: visibleData,
            fetchedAt: exactCache?.fetchedAt || broadCache?.fetchedAt || Date.now(),
            hasMore: false,
            nextCursor: null,
            offline: true,
          });
          setReportsHasMore(false);
          setReportsError('');
          setIsReportsOffline(true);
          return;
        }
        const cached = await loadCachedReports(currentPersonnelId).catch(() => null);
        if (cached) {
          const cachedView = filterCachedReports(cached.data, category, dateRange);
          reportViewCache.current.set(viewCacheKey, {
            data: cachedView,
            fetchedAt: Date.parse(cached.updatedAt) || Date.now(),
            hasMore: false,
            nextCursor: null,
            offline: true,
          });
          setReports(cachedView);
          setReportsHasMore(false);
          setReportsError('');
          setIsReportsOffline(true);
          return;
        }
        setReportsHasMore(false);
        setReportsError(requestErrorMessage(error, { action: 'load reports' }));
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
      setReports((items) => {
        const merged = mergeById(items, payload.data);
        reportViewCache.current.set(activeViewCacheKey.current, {
          data: merged,
          fetchedAt: Date.now(),
          hasMore: payload.pagination.hasNextPage,
          nextCursor: payload.pagination.nextCursor,
          offline: false,
        });
        return merged;
      });
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
      setIsReportsOffline(false);
      void saveCachedReports(currentPersonnelId, payload.data).catch(() => undefined);
    } catch (error) {
      const cached = await loadCachedReports(currentPersonnelId).catch(() => null);
      if (cached) {
        setReports((items) => mergeById(items, filterCachedReports(cached.data, reportCategory, reportDateRange)));
        setReportsHasMore(false);
        setReportsError('');
        setIsReportsOffline(true);
      } else {
        setReportsError(requestErrorMessage(error, { action: 'load previous reports' }));
        throw error;
      }
    } finally {
      setIsReportsLoadingMore(false);
    }
  }, [currentPersonnelId, isReportsLoadingMore, reportCategory, reportCursor, reportDateRange, setReports, token]);

  return {
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
    isReportsOffline,
    refreshReports,
    loadMoreReports,
    resetReportPagination,
    invalidateReportViews,
  };
}
