import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { fetchReportPage, fetchTaskHistoryPage } from '../../services/operationsApi';
import {
  loadCachedReports,
  loadCachedTasks,
  saveCachedReports,
  saveCachedTasks,
} from '../../services/offlineOperationsCache';
import type { OperationalTask, PoliceReport } from '../../types/operations';
import { useReportPagination } from '../reports/useReportPagination';
import { useTaskHistoryPagination } from '../tasks/useTaskHistoryPagination';

jest.mock('../../services/operationsApi', () => ({
  fetchReportPage: jest.fn(),
  fetchTaskHistoryPage: jest.fn(),
}));
jest.mock('../../services/offlineOperationsCache', () => ({
  loadCachedReports: jest.fn(),
  loadCachedTasks: jest.fn(),
  saveCachedReports: jest.fn(async () => undefined),
  saveCachedTasks: jest.fn(async () => undefined),
}));

const incident = {
  id: 'report-incident', is_incident: true, date_time: '2026-09-22T10:00:00.000Z',
} as PoliceReport;
const routine = {
  id: 'report-routine', is_incident: false, date_time: '2026-09-21T10:00:00.000Z',
} as PoliceReport;
const historyTask = { id: 'task-history', status: 'completed' } as OperationalTask;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(loadCachedReports).mockResolvedValue(null);
  jest.mocked(loadCachedTasks).mockResolvedValue(null);
  jest.mocked(saveCachedReports).mockResolvedValue(undefined);
  jest.mocked(saveCachedTasks).mockResolvedValue(undefined);
});

it('shows encrypted cached reports when the report request has no connection', async () => {
  jest.mocked(fetchReportPage).mockRejectedValue(new Error('Network request failed'));
  jest.mocked(loadCachedReports).mockResolvedValue({
    data: [incident, routine], updatedAt: '2026-09-22T10:05:00.000Z',
  });
  const { result } = await renderHook(() => {
    const [reports, setReports] = useState<PoliceReport[]>([]);
    return { reports, ...useReportPagination({ currentPersonnelId: 'officer', setReports, token: 'token' }) };
  });
  await act(async () => { await result.current.refreshReports('incident'); });
  expect(result.current.reports).toEqual([incident]);
  expect(result.current.isReportsOffline).toBe(true);
  expect(result.current.reportsError).toBe('');
});

it('reuses a fresh report view without showing another loading request', async () => {
  jest.mocked(fetchReportPage).mockResolvedValue({
    data: [incident],
    pagination: { hasNextPage: false, nextCursor: null, limit: 20 },
  });
  const { result } = await renderHook(() => {
    const [reports, setReports] = useState<PoliceReport[]>([]);
    return { reports, ...useReportPagination({ currentPersonnelId: 'officer', setReports, token: 'token' }) };
  });

  await act(async () => {
    await result.current.refreshReports('incident', {}, { cacheKey: 'incident:all' });
  });
  expect(result.current.reports).toEqual([incident]);
  expect(fetchReportPage).toHaveBeenCalledTimes(1);

  await act(async () => {
    await result.current.refreshReports('incident', {}, { cacheKey: 'incident:all' });
  });
  expect(fetchReportPage).toHaveBeenCalledTimes(1);
  expect(result.current.isReportsLoading).toBe(false);
});

it('restores cached completed tasks without replacing active in-memory tasks', async () => {
  jest.mocked(fetchTaskHistoryPage).mockRejectedValue(new Error('Network request failed'));
  jest.mocked(loadCachedTasks).mockResolvedValue({
    data: [historyTask], updatedAt: '2026-09-22T10:05:00.000Z',
  });
  const activeTask = { id: 'task-active', status: 'open' } as OperationalTask;
  const { result } = await renderHook(() => {
    const [tasks, setTasks] = useState<OperationalTask[]>([activeTask]);
    return { tasks, ...useTaskHistoryPagination({ currentPersonnelId: 'officer', setTasks, token: 'token' }) };
  });
  await act(async () => { await result.current.refreshTaskHistory(); });
  await waitFor(() => expect(result.current.tasks).toEqual([activeTask, historyTask]));
  expect(result.current.isTaskHistoryOffline).toBe(true);
  expect(result.current.taskHistoryHasMore).toBe(false);
});
