import {
  selectActiveBackupRequest,
  selectEmergencyPersonnelIds,
  selectVisiblePersonnel,
} from './officerMapState';

describe('officer map selectors', () => {
  it('filters stale and invalid positions', () => {
    const visible = selectVisiblePersonnel([
      { id: 'current', latitude: 17.4, longitude: 121.7 } as never,
      { id: 'stale', latitude: 17.4, longitude: 121.7, isLocationStale: true } as never,
    ], 'current', { isOnDuty: true } as never);
    expect(visible.map(({ id }) => id)).toEqual(['current']);
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
});
