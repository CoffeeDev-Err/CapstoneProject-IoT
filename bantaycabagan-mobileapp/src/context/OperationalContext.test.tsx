import { act, renderHook } from '@testing-library/react-native';
import { OperationalProvider, useOperationalContext } from './OperationalContext';
import { fetchOperations, fetchLivePersonnel } from '../services/operationsApi';

jest.mock('./AuthContext', () => ({ useAuth: () => ({ token: 'test', user: { personnelId: 'officer' } }) }));
jest.mock('../services/operationsApi', () => ({
  fetchOperations: jest.fn(), fetchLivePersonnel: jest.fn(), resolveApiAssetUrl: (value: string) => value,
}));
jest.mock('../features/operations/useOperationalSocket', () => ({ useOperationalSocket: () => false }));
jest.mock('../features/reports/useOfflineReportSync', () => ({ useOfflineReportSync: () => ({ submitReport: jest.fn() }) }));
jest.mock('../features/reports/useReportPagination', () => {
  const state = { refreshReports: jest.fn(async () => {}), resetReportPagination: jest.fn() };
  return { useReportPagination: () => state };
});
jest.mock('../features/tasks/useTaskHistoryPagination', () => {
  const state = { resetTaskHistoryPagination: jest.fn() };
  return { useTaskHistoryPagination: () => state };
});

describe('mobile bootstrap recovery', () => {
  it('keeps the successful resource, shows the failure, and recovers on retry', async () => {
    jest.mocked(fetchOperations).mockRejectedValueOnce(new Error('Offline'));
    jest.mocked(fetchLivePersonnel).mockResolvedValue({ data: [{ id: 'officer' }] } as Awaited<ReturnType<typeof fetchLivePersonnel>>);
    const { result } = await renderHook(useOperationalContext, { wrapper: OperationalProvider });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialDataError).toContain('tasks and deployments');
    expect(result.current.personnel[0].id).toBe('officer');
    jest.mocked(fetchOperations).mockResolvedValue({ tasks: [], reports: [], deployments: [], upcomingDeployment: null });
    await act(async () => { await result.current.refreshOperations(); });
    expect(result.current.initialDataError).toBe('');
    expect(result.current.isLoading).toBe(false);
    jest.mocked(fetchLivePersonnel).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => { await result.current.refreshOperations(); });
    expect(result.current.personnel[0].id).toBe('officer');
    expect(result.current.initialDataError).toContain('personnel locations');
  });
});
