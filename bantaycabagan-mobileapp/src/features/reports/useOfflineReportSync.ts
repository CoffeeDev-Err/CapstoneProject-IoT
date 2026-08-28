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

  const uploadPendingReport = useCallback(async (pending: PendingReport) => {
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
      if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
        await discardRejectedPendingReport(pending);
        throw error;
      }
      return 'queued' as const;
    }
  }, [actor, currentPersonnelId, deployments, setReports, token, uploadPendingReport]);

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
        } catch {
          // Keep every unconfirmed report and its evidence for a later retry.
        }
      }
    } finally {
      syncRunning.current = false;
    }
  }, [currentPersonnelId, token, uploadPendingReport]);

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
