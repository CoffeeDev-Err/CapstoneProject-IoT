import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fetchPoliceReport } from '../../services/operationsApi';
import type { PoliceReport } from '../../types/operations';
import { useReportDetails } from './useReportDetails';
jest.mock('../../services/operationsApi', () => ({ fetchPoliceReport: jest.fn() }));
const report = { id: 'RPT-OLD', revision: 1, validation_status: 'validated' } as PoliceReport;
beforeEach(() => jest.resetAllMocks());
it('loads the exact report even when it is absent from the paginated history', async () => {
  jest.mocked(fetchPoliceReport).mockResolvedValue({ report });
  const { result } = await renderHook(() => useReportDetails('session', []));
  await act(() => result.current.openReport('RPT-OLD'));
  await waitFor(() => expect(result.current.selectedReport?.validation_status).toBe('validated'));
  expect(fetchPoliceReport).toHaveBeenCalledWith('RPT-OLD', 'session');
});
it('refreshes visible details from newer socket revisions, without reverting to older data', async () => {
  jest.mocked(fetchPoliceReport).mockResolvedValue({ report });
  const { result, rerender } = await renderHook<ReturnType<typeof useReportDetails>, { reports: PoliceReport[] }>(({ reports }) => useReportDetails('session', reports), { initialProps: { reports: [] } });
  await act(() => result.current.openReport('RPT-OLD'));
  await waitFor(() => expect(result.current.selectedReport?.revision).toBe(1));
  await rerender({ reports: [{ ...report, revision: 2, validation_status: 'pending' }] });
  expect(result.current.selectedReport?.validation_status).toBe('pending');
  await rerender({ reports: [report] });
  expect(result.current.selectedReport?.revision).toBe(2);
});
it('provides retry on failure and ignores a response for a closed report', async () => {
  jest.mocked(fetchPoliceReport).mockRejectedValueOnce(new Error('Connection failed.')).mockResolvedValueOnce({ report });
  const { result } = await renderHook(() => useReportDetails('session', []));
  await act(() => result.current.openReport('RPT-OLD'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.selectedReport?.id).toBe('RPT-OLD'));
  let resolve!: (value: { report: PoliceReport }) => void;
  jest.mocked(fetchPoliceReport).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await act(() => result.current.refresh());
  await act(() => result.current.openReport(null));
  await act(() => resolve({ report }));
  expect(result.current.selectedReport).toBeNull();
});
it('keeps cached report details visible when the network request fails', async () => {
  jest.mocked(fetchPoliceReport).mockRejectedValue(new Error('Network request failed'));
  const { result } = await renderHook(() => useReportDetails('session', [report]));
  await act(() => result.current.openReport('RPT-OLD'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.selectedReport).toEqual(report);
});
