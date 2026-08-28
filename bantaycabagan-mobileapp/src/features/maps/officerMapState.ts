import { isInsideCabagan } from '../../constants/cabaganGeofence';
import type { OfficerMapPerson } from '../../components/OfficerMapCanvas';
import type { LivePersonnel, OperationalTask } from '../../types/operations';

export const selectVisiblePersonnel = (
  personnel: LivePersonnel[],
  currentPersonnelId: string,
  currentOfficer: LivePersonnel,
) => {
  if (personnel.length) {
    return personnel.filter((member) => (
      member.isVisibleOnMap !== false
      && member.isLocationStale !== true
      && Number.isFinite(member.latitude)
      && Number.isFinite(member.longitude)
    ));
  }
  return currentPersonnelId && currentOfficer.isVisibleOnMap !== false ? [currentOfficer] : [];
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
