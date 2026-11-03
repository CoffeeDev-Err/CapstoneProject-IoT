import type { OperationalTask } from '../types/operations';

export type ReportNavigationParams = {
  backupTask?: OperationalTask;
  backupReportRequestId?: number;
  reportId?: string;
  notificationRequestId?: number;
  draftRequestId?: number;
};

export function backupReportParams(task: OperationalTask): ReportNavigationParams {
  return {
    backupTask: task,
    backupReportRequestId: Date.now(),
    reportId: undefined,
    notificationRequestId: undefined,
    draftRequestId: undefined,
  };
}

export function existingReportParams(reportId: string): ReportNavigationParams {
  return {
    reportId,
    notificationRequestId: Date.now(),
    backupTask: undefined,
    backupReportRequestId: undefined,
    draftRequestId: undefined,
  };
}
