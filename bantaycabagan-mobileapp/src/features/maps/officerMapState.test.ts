import {
  selectActiveBackupRequest,
  selectEmergencyPersonnelIds,
  selectVisiblePersonnel,
  isSamePersonnelId,
} from './officerMapState';

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
});
