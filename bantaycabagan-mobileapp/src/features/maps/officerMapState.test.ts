import {
  selectActiveBackupRequest,
  selectEmergencyPersonnelIds,
  selectVisiblePersonnel,
  isSamePersonnelId,
} from './officerMapState';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';

describe('officer map selectors', () => {
  it('recognizes the current officer even when an API changes id casing or whitespace', () => {
    expect(isSamePersonnelId(' PNP-001 ', 'pnp-001')).toBe(true);
    expect(isSamePersonnelId('PNP-001', 'PNP-002')).toBe(false);
  });
  it('keeps stale last known positions while filtering invalid, hidden and off-duty records', () => {
    const visible = selectVisiblePersonnel([
      { id: 'current', latitude: 17.4, longitude: 121.7 } as never,
      { id: 'stale', latitude: 17.4, longitude: 121.7, isLocationStale: true } as never,
      { id: 'missing', latitude: null, longitude: null } as never,
      { id: 'hidden', latitude: 17.4, longitude: 121.7, isVisibleOnMap: false } as never,
      { id: 'off-duty', latitude: 17.4, longitude: 121.7, isOnDuty: false } as never,
    ], 'current', { isOnDuty: true } as never);
    expect(visible.map(({ id }) => id)).toEqual(['current', 'stale']);
  });

  it('keeps the current officer fallback only when last known coordinates exist', () => {
    expect(selectVisiblePersonnel([], 'P-1', {
      id: 'P-1', isOnDuty: true, isLocationStale: true, latitude: 17.4, longitude: 121.7,
    } as never)).toHaveLength(1);
    expect(selectVisiblePersonnel([], 'P-1', {
      id: 'P-1', isOnDuty: true, latitude: null, longitude: null,
    } as never)).toEqual([]);
  });

  it('does not render personnel locations for an off-duty officer', () => {
    const visible = selectVisiblePersonnel([
      { id: 'current', latitude: 17.4, longitude: 121.7, isOnDuty: false } as never,
      { id: 'on-duty', latitude: 17.41, longitude: 121.71, isOnDuty: true } as never,
    ], 'current', { id: 'current', isOnDuty: false } as never);
    expect(visible).toEqual([]);
  });

  it('derives active backup ownership from tasks', () => {
    const tasks = [{
      id: 'T-1', type: 'backup', requested_by: 'P-1', status: 'open', accepted_by: [],
    }] as never;
    expect(selectEmergencyPersonnelIds(tasks).has('P-1')).toBe(true);
    expect(selectActiveBackupRequest(tasks, 'P-1')?.id).toBe('T-1');
  });

  it('hides the previous duty fix after acknowledgement and accepts an outage fix from this duty', () => {
    const now = Date.now();
    const assignment = { status: 'active', acknowledged: true, shiftStart: new Date(now - 600_000).toISOString(), shiftEnd: new Date(now + 600_000).toISOString() } as DeploymentAssignment;
    const old = { id: 'P-1', isOnDuty: true, isVisibleOnMap: true, latitude: 17.4, longitude: 121.7, locationRecordedAt: new Date(now - 900_000).toISOString() } as LivePersonnel;
    expect(selectVisiblePersonnel([old], 'P-1', old, assignment)).toEqual([]);
    const stale = { ...old, isLocationStale: true, locationRecordedAt: new Date(now - 300_000).toISOString() };
    expect(selectVisiblePersonnel([stale], 'P-1', stale, assignment)).toEqual([stale]);
    expect(selectVisiblePersonnel([stale], 'P-1', stale, { ...assignment, shiftEnd: new Date(now).toISOString() }, now)).toEqual([]);
  });

  it('hides cached roster markers when their duty has ended without waiting for a socket update', () => {
    const now = Date.now();
    const current = { id: 'P-1', isOnDuty: true } as never;
    const ended = { id: 'P-2', isOnDuty: true, latitude: 17.4, longitude: 121.7, locationRecordedAt: new Date(now - 120_000).toISOString(), activeShiftEnd: new Date(now - 60_000).toISOString() } as never;
    expect(selectVisiblePersonnel([ended], 'P-1', current)).toEqual([]);
  });
});
