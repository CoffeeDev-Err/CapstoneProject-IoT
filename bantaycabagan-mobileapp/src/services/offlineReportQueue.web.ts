import type { ReportEvidenceInput, SubmitReportInput } from '../types/operations';

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

export type PendingReportReadFailure = {
  id: string;
  createdAt: string;
  message: string;
};

export type PendingReportQueueSnapshot = {
  reports: PendingReport[];
  failures: PendingReportReadFailure[];
};

export type StoredReportDraft = {
  form: SubmitReportInput;
  evidencePhoto: ReportEvidenceInput | null;
  updatedAt: string;
};

export const discardTemporaryEvidence = async (_uri?: string | null) => undefined;
export const cleanupOrphanedPickerEvidence = async () => undefined;
export const loadReportDraft = async (_personnelId: string): Promise<StoredReportDraft | null> => null;
export const saveReportDraft = async (
  _personnelId: string,
  _form: SubmitReportInput,
  _evidencePhoto: ReportEvidenceInput | null,
): Promise<StoredReportDraft | null> => null;
export const clearReportDraft = async (_personnelId: string) => undefined;
export const stagePendingReport = async (
  _input: SubmitReportInput,
  _personnelId: string,
): Promise<PendingReport | null> => null;
export const getPendingReports = async (
  _personnelId: string,
): Promise<PendingReportQueueSnapshot> => ({ reports: [], failures: [] });
export const markPendingReportUploading = async (_id: string) => undefined;
export const markPendingReportFailed = async (_id: string, _error: unknown) => undefined;
export const completePendingReport = async (_report: PendingReport) => undefined;
export const discardRejectedPendingReport = async (_report: PendingReport) => undefined;
export const cleanupConfirmedReports = async () => undefined;
