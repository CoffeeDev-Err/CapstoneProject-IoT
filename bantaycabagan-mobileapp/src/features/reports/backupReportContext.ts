import { isInsideCabagan } from '../../constants/cabaganGeofence';
import type { OperationalTask } from '../../types/operations';
import { getBarangayFromArea, type ReportForm } from './reportForm';

export function backupReportFields(task: OperationalTask, assignedArea: string): Partial<ReportForm> {
  const latitude = Number(task.latitude);
  const longitude = Number(task.longitude);
  const usableLocation = task.latitude != null && task.longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && isInsideCabagan(latitude, longitude);
  return {
    report_type: 'incident',
    backup_task_id: task.id,
    occurred_at: task.created_at,
    assigned_area: task.assigned_area || assignedArea,
    barangay: getBarangayFromArea(task.location),
    location: task.location,
    location_source: usableLocation ? 'backup_request' : 'manual',
    latitude: usableLocation ? latitude : undefined,
    longitude: usableLocation ? longitude : undefined,
    backup_context: {
      task_id: task.id,
      requested_at: task.created_at,
      completed_at: task.completed_at || '',
      request_location: task.location,
      assigned_area: task.assigned_area || assignedArea,
      latitude: usableLocation ? latitude : undefined,
      longitude: usableLocation ? longitude : undefined,
      responders: task.responders || [],
    },
  };
}

export function canLinkBackup(task: OperationalTask, personnelId: string): boolean {
  return task.type === 'backup' && task.status === 'completed'
    && task.requested_by === personnelId && !task.report_id;
}
