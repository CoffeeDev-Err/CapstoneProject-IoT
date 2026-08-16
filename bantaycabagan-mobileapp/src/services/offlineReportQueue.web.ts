import type { SubmitReportInput } from '../types/operations';

// Browser builds are a UI preview only. Native Android/iOS builds resolve the
// SQLite-backed module, while web submissions continue directly to the API.
export type PendingReport = {
  id: string;
  personnelId: string;
  input: SubmitReportInput;
  evidenceUri: string | null;
  createdAt: string;
  attemptCount: number;
};

export const discardTemporaryEvidence = async (_uri?: string | null) => undefined;
export const cleanupOrphanedPickerEvidence = async () => undefined;
export const stagePendingReport = async (
  _input: SubmitReportInput,
  _personnelId: string,
): Promise<PendingReport | null> => null;
export const getPendingReports = async (_personnelId: string): Promise<PendingReport[]> => [];
export const markPendingReportUploading = async (_id: string) => undefined;
export const markPendingReportFailed = async (_id: string, _error: unknown) => undefined;
export const completePendingReport = async (_report: PendingReport) => undefined;
export const discardRejectedPendingReport = async (_report: PendingReport) => undefined;
export const cleanupConfirmedReports = async () => undefined;
