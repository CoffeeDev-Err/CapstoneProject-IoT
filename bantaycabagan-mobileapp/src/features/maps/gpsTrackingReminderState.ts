import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';

export const GPS_TRACKING_REMINDER_GRACE_MS = 2 * 60 * 1000;

const asTimestamp = (value?: string | null) => {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

const formatAge = (seconds: number) => {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

export type GpsTrackingReminderState = {
  kind: 'stale' | 'unavailable';
  statusText: string;
};

export const getGpsTrackingReminderState = ({
  assignment,
  officer,
  now = Date.now(),
}: {
  assignment?: DeploymentAssignment;
  officer: LivePersonnel;
  now?: number;
}): GpsTrackingReminderState | null => {
  if (!assignment || assignment.status !== 'active' || assignment.isCurrentShift === false) return null;

  const shiftStartedAt = asTimestamp(assignment.shiftStart) ?? asTimestamp(assignment.assignedAt);
  if (!shiftStartedAt || now - shiftStartedAt < GPS_TRACKING_REMINDER_GRACE_MS) return null;

  const recordedAt = asTimestamp(officer.locationRecordedAt);
  const staleAfterMs = Math.max(30, officer.locationStaleAfterSeconds || 120) * 1000;
  const ageMs = recordedAt === null ? Number.POSITIVE_INFINITY : now - recordedAt;
  const hasCoordinates = Number.isFinite(officer.latitude) && Number.isFinite(officer.longitude);
  const hasFreshLocation = hasCoordinates
    && ageMs >= -5 * 60 * 1000
    && ageMs <= staleAfterMs
    && officer.isLocationStale !== true
    && officer.locationStatus !== 'stale'
    && officer.locationStatus !== 'unavailable';

  if (hasFreshLocation) return null;
  if (recordedAt === null) {
    return {
      kind: 'unavailable',
      statusText: 'No GPS location has been received for this active shift.',
    };
  }

  const ageSeconds = Math.max(0, Math.floor(ageMs / 1000));
  return {
    kind: 'stale',
    statusText: `The last GPS update was ${formatAge(ageSeconds)} ago.`,
  };
};
