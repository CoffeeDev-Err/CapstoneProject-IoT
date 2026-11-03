import { backupReportParams, existingReportParams } from './reportNavigation';
import type { OperationalTask } from '../types/operations';

it('passes the complete backup record and clears a previous report or draft destination', () => {
  const task = { id: 'backup-1', responders: [{ name: 'Responder One' }] } as OperationalTask;
  const previous = { reportId: 'previous-report', draftRequestId: 42 };
  const params = { ...previous, ...backupReportParams(task) };
  expect(params.backupTask).toBe(task);
  expect(params.backupReportRequestId).toBeGreaterThan(0);
  expect(params.reportId).toBeUndefined();
  expect(params.draftRequestId).toBeUndefined();
});

it('clears a previous backup form request when opening an existing report', () => {
  const previous = backupReportParams({ id: 'backup-1' } as OperationalTask);
  const params = { ...previous, ...existingReportParams('report-1') };
  expect(params.reportId).toBe('report-1');
  expect(params.notificationRequestId).toBeGreaterThan(0);
  expect(params.backupTask).toBeUndefined();
  expect(params.backupReportRequestId).toBeUndefined();
});
