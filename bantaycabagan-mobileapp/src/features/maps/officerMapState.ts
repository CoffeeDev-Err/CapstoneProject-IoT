import { isInsideCabagan } from '../../constants/cabaganGeofence';
import type { OfficerMapPerson } from '../../components/OfficerMapCanvas';
import type { DeploymentAssignment, LivePersonnel, OperationalTask } from '../../types/operations';
import { hasDutyLocation } from './dutyLocation';
import { isDeploymentActiveNow } from '../operations/operationalState';

export const normalizePersonnelId = (value?: string | null) => String(value || '').trim().toLowerCase();

export const isSamePersonnelId = (first?: string | null, second?: string | null) => (
  Boolean(normalizePersonnelId(first)) && normalizePersonnelId(first) === normalizePersonnelId(second)
);

export const selectVisiblePersonnel = (
  personnel: LivePersonnel[],
  currentPersonnelId: string,
  currentOfficer: LivePersonnel,
  assignment?: DeploymentAssignment,
  now = Date.now(),
) => {
  // Location sharing is available only while the viewing officer has an
  // active deployment. Keep this client-side guard even though the API and
  // socket payloads are also scoped by the backend.
  if (currentOfficer.isOnDuty !== true || (assignment && !isDeploymentActiveNow(assignment, now))) return [];
  if (personnel.length) {
    return personnel.filter((member) => (
      hasDutyLocation(member, isSamePersonnelId(member.id, currentPersonnelId) ? assignment : undefined, now)
    ));
  }
  return currentPersonnelId && hasDutyLocation(currentOfficer, assignment, now)
    ? [currentOfficer] : [];
};

export const selectEmergencyPersonnelIds = (tasks: OperationalTask[]) => new Set(
  tasks
    .filter((task) => task.type === 'backup' && (task.status === 'open' || task.status === 'full'))
    .map((task) => task.requested_by),
);

export const selectOperationPersonnelIds = (tasks: OperationalTask[]) => {
  const ids = new Set<string>();
  tasks
    .filter((task) => task.status === 'open' || task.status === 'full')
    .forEach((task) => {
      if (task.type !== 'backup') ids.add(task.requested_by);
      task.accepted_by.forEach((personnelId) => ids.add(personnelId));
    });
  return ids;
};

export const selectActiveBackupRequest = (tasks: OperationalTask[], personnelId: string) => (
  tasks.find((task) => (
    task.type === 'backup'
    && task.requested_by === personnelId
    && (task.status === 'open' || task.status === 'full')
  ))
);

export const createMapPersonnel = (
  visiblePersonnel: LivePersonnel[],
  emergencyPersonnelIds: Set<string>,
  operationPersonnelIds: Set<string>,
): OfficerMapPerson[] => visiblePersonnel.map((member) => ({
  ...member,
  emergencyActive: emergencyPersonnelIds.has(member.id),
  operationActive: operationPersonnelIds.has(member.id),
  outsideBoundary: !isInsideCabagan(Number(member.latitude), Number(member.longitude)),
}));
