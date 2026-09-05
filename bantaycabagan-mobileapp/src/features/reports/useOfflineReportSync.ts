import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import * as Network from 'expo-network';
import { Alert, AppState } from 'react-native';
import {
  ApiRequestError,
  submitPoliceReport,
} from '../../services/operationsApi';
import {
  cleanupConfirmedReports,
  cleanupOrphanedPickerEvidence,
  completePendingReport,
  discardRejectedPendingReport,
  getPendingReports,
  markPendingReportFailed,
  markPendingReportUploading,
  stagePendingReport,
  type PendingReport,
} from '../../services/offlineReportQueue';
import type { DeploymentAssignment, PoliceReport, SubmitReportInput } from '../../types/operations';
import { upsertById } from '../operations/operationalState';

const OFFLINE_REPORT_RETRY_INTERVAL_MS = 30_000;
const isRetryableFailure = (error: unknown) => !(error instanceof ApiRequestError)
  || error.status === 0 || error.status >= 500
  || [401, 403, 408, 425, 429].includes(error.status);

type OfflineReportSyncOptions = {
  actor: { id: string; name: string; station: string };
  currentPersonnelId: string;
  deployments: DeploymentAssignment[];
  isConnected: boolean;
  setReports: Dispatch<SetStateAction<PoliceReport[]>>;
  token?: string | null;
};

export function useOfflineReportSync({
  actor, currentPersonnelId, deployments, isConnected, setReports, token,
}: OfflineReportSyncOptions) {
  const syncRunning = useRef(false);
  const reportedFailureIds = useRef(new Set<string>());
  const uploads = useRef(new Map<string, Promise<PoliceReport>>());
  const authFailureNotified = useRef(false);
  useEffect(() => { authFailureNotified.current = false; }, [token]);

  const notifyAuthFailure = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError && [401, 403].includes(error.status) && !authFailureNotified.current) {
      authFailureNotified.current = true;
      Alert.alert('Report synchronization paused',
        'Your reports and evidence are saved on this device. Sign in again to resume synchronization. If access is still denied, contact your administrator.');
    }
  }, []);

  const performUpload = useCallback(async (pending: PendingReport) => {
    await markPendingReportUploading(pending.id);
    try {
      const response = await submitPoliceReport(pending.input, actor, deployments[0], token);
      if (pending.input.evidence_photo && !response.report.evidence_photo?.url) {
        throw new Error('The backend did not confirm the uploaded evidence.');
      }
      await completePendingReport(pending);
      reportedFailureIds.current.delete(pending.id);
      setReports((items) => upsertById(items, response.report));
      return response.report;
    } catch (error) {
      await markPendingReportFailed(pending.id, error);
      throw error;
    }
  }, [actor, deployments, setReports, token]);

  const uploadPendingReport = useCallback((pending: PendingReport) => {
    const running = uploads.current.get(pending.id);
    if (running) return running;
    const upload = performUpload(pending).finally(() => uploads.current.delete(pending.id));
    uploads.current.set(pending.id, upload);
    return upload;
  }, [performUpload]);

  const submitReport = useCallback(async (input: SubmitReportInput) => {
    const preparedInput = {
      ...input,
      assigned_area: input.assigned_area || deployments[0]?.patrolArea || actor.station,
    };
    const pending = await stagePendingReport(preparedInput, currentPersonnelId);
    if (!pending) {
      const response = await submitPoliceReport(preparedInput, actor, deployments[0], token);
      setReports((items) => upsertById(items, response.report));
      return 'submitted' as const;
    }
    try {
      await uploadPendingReport(pending);
      return 'submitted' as const;
    } catch (error) {
      notifyAuthFailure(error);
      if (!isRetryableFailure(error)) {
        await discardRejectedPendingReport(pending);
        throw error;
      }
      return 'queued' as const;
    }
  }, [actor, currentPersonnelId, deployments, notifyAuthFailure, setReports, token, uploadPendingReport]);

  const synchronizePendingReports = useCallback(async () => {
    if (!currentPersonnelId || !token || syncRunning.current) return;
    syncRunning.current = true;
    try {
      await cleanupConfirmedReports();
      const { reports: pendingReports, failures } = await getPendingReports(currentPersonnelId);
      const newFailures = failures.filter((failure) => !reportedFailureIds.current.has(failure.id));
      newFailures.forEach((failure) => reportedFailureIds.current.add(failure.id));
      if (newFailures.length > 0) {
        Alert.alert('Offline report needs attention',
          `${newFailures.length} saved report${newFailures.length === 1 ? '' : 's'} could not be opened. `
          + 'The report data and evidence were preserved on this device for recovery.');
      }
      for (const pending of pendingReports) {
        try {
          await uploadPendingReport(pending);
        } catch (error) {
          notifyAuthFailure(error);
          // Keep every unconfirmed report and its evidence for a later retry.
          // Stop the batch on connectivity/auth/rate-limit failures instead of
          // sending every queued report to an unavailable server.
          if (isRetryableFailure(error)) break;
          if (!reportedFailureIds.current.has(pending.id)) {
            reportedFailureIds.current.add(pending.id);
            Alert.alert('Offline report needs attention',
              'A saved report was rejected by the server. Its data and evidence remain on this device. Contact your administrator.');
          }
        }
      }
    } finally {
      syncRunning.current = false;
    }
  }, [currentPersonnelId, notifyAuthFailure, token, uploadPendingReport]);

  useEffect(() => { cleanupOrphanedPickerEvidence().catch(() => undefined); }, []);
  useEffect(() => {
    if (isConnected) synchronizePendingReports().catch(() => undefined);
  }, [isConnected, synchronizePendingReports]);
  useEffect(() => {
    if (!currentPersonnelId || !token) return undefined;
    const retryPendingReports = () => synchronizePendingReports().catch(() => undefined);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retryPendingReports();
    });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected) retryPendingReports();
    });
    const retryInterval = setInterval(retryPendingReports, OFFLINE_REPORT_RETRY_INTERVAL_MS);
    return () => {
      appStateSubscription.remove();
      networkSubscription.remove();
      clearInterval(retryInterval);
    };
  }, [currentPersonnelId, synchronizePendingReports, token]);

  return { submitReport, synchronizePendingReports };
}
