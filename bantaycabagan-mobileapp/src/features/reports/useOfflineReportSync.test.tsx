import { act, renderHook } from '@testing-library/react-native';
import { useOfflineReportSync } from './useOfflineReportSync';
import { ApiRequestError, submitPoliceReport } from '../../services/operationsApi';
import * as queue from '../../services/offlineReportQueue';
import type { PoliceReport, SubmitReportInput } from '../../types/operations';

jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: jest.fn() }) }));
jest.mock('../../services/operationsApi', () => ({
  ApiRequestError: class extends Error { constructor(message: string, code: number) { super(message); Object.assign(this, { status: code }); } },
  submitPoliceReport: jest.fn(),
}));
jest.mock('../../services/offlineReportQueue', () => ({
  stagePendingReport: jest.fn(), markPendingReportUploading: jest.fn(),
  markPendingReportFailed: jest.fn(), completePendingReport: jest.fn(),
  discardRejectedPendingReport: jest.fn(), cleanupConfirmedReports: jest.fn(),
  cleanupOrphanedPickerEvidence: jest.fn(), getPendingReports: jest.fn(),
}));

const input = { client_submission_id: 'mobile-test-001', evidence_photo: { uri: 'mock-photo' } } as SubmitReportInput;
const pending = { id: 'mobile-test-001', personnelId: 'officer', input, evidenceUri: 'mock-photo', createdAt: '2026-09-05', attemptCount: 0 };
const options = { actor: { id: 'officer', name: 'Test', station: 'Test' }, currentPersonnelId: 'officer', deployments: [], isConnected: false, setReports: jest.fn(), token: 'test' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(queue.stagePendingReport).mockResolvedValue(pending);
  jest.mocked(queue.cleanupOrphanedPickerEvidence).mockResolvedValue(undefined);
  jest.mocked(queue.getPendingReports).mockResolvedValue({ reports: [pending], failures: [] });
});

describe('offline report reliability', () => {
  it.each([0, 401, 403, 408, 425, 429, 500, 503])('preserves the queued report and evidence for status %s', async (status) => {
    jest.mocked(submitPoliceReport).mockRejectedValue(new ApiRequestError('Temporary failure', status));
    const { result } = await renderHook(() => useOfflineReportSync(options));
    await act(async () => { expect(await result.current.submitReport(input)).toBe('queued'); });
    expect(queue.markPendingReportFailed).toHaveBeenCalled();
    expect(queue.discardRejectedPendingReport).not.toHaveBeenCalled();
    expect(queue.completePendingReport).not.toHaveBeenCalled();
  });
  it('retries using the original submission ID and only completes after evidence confirmation', async () => {
    jest.mocked(submitPoliceReport).mockResolvedValue({ report: { id: 'saved', evidence_photo: { url: 'https://test.invalid/photo' } } as PoliceReport });
    const { result } = await renderHook(() => useOfflineReportSync(options));
    await act(async () => { await result.current.synchronizePendingReports(); });
    expect(submitPoliceReport).toHaveBeenCalledWith(input, options.actor, undefined, 'test');
    expect(queue.completePendingReport).toHaveBeenCalledWith(pending);
  });
  it('keeps unconfirmed evidence and stops a failed batch', async () => {
    jest.mocked(queue.getPendingReports).mockResolvedValue({ reports: [pending, { ...pending, id: 'second' }], failures: [] });
    jest.mocked(submitPoliceReport).mockResolvedValue({ report: { id: 'saved' } as PoliceReport });
    const { result } = await renderHook(() => useOfflineReportSync(options));
    await act(async () => { await result.current.synchronizePendingReports(); });
    expect(queue.completePendingReport).not.toHaveBeenCalled();
    expect(submitPoliceReport).toHaveBeenCalledTimes(1);
  });
  it('shares a simultaneous initial upload and background retry of the same row', async () => {
    let resolve!: (value: { report: PoliceReport }) => void;
    jest.mocked(submitPoliceReport).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = await renderHook(() => useOfflineReportSync(options));
    await act(async () => {
      const initial = result.current.submitReport(input);
      await Promise.resolve();
      await Promise.resolve();
      const retry = result.current.synchronizePendingReports();
      await Promise.resolve();
      await Promise.resolve();
      resolve({ report: { id: 'saved', evidence_photo: { url: 'https://test.invalid/photo' } } as PoliceReport });
      await Promise.all([initial, retry]);
    });
    expect(submitPoliceReport).toHaveBeenCalledTimes(1);
    expect(queue.completePendingReport).toHaveBeenCalledTimes(1);
  });
});
