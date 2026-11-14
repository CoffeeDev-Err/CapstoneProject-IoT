import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import { isDeploymentActiveNow } from '../operations/operationalState';

// A last-known fix may survive a signal outage, never a change of duty.
export function hasDutyLocation(officer: LivePersonnel, assignment?: DeploymentAssignment, now = Date.now()) {
  if (officer.isOnDuty === false || officer.isVisibleOnMap === false
    || !Number.isFinite(officer.latitude) || !Number.isFinite(officer.longitude)) return false;
  if (assignment && !isDeploymentActiveNow(assignment, now)) return false;
  const start = assignment?.shiftStart || officer.activeShiftStart;
  const end = assignment?.shiftEnd || officer.activeShiftEnd;
  const recordedAt = Date.parse(officer.locationRecordedAt || '');
  if (start && (!Number.isFinite(recordedAt) || recordedAt < Date.parse(start) || now < Date.parse(start))) return false;
  if (end && (now >= Date.parse(end) || recordedAt >= Date.parse(end))) return false;
  return !Number.isFinite(recordedAt) ? !start : recordedAt <= now + 5 * 60_000;
}
