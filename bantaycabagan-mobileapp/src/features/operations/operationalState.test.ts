import {
  isActiveTask,
  mergeById,
  selectCurrentDeployment,
  upsertById,
} from './operationalState';
import type { DeploymentAssignment } from '../../types/operations';

describe('operational state', () => {
  it('upserts and merges records without duplicate IDs', () => {
    expect(upsertById([{ id: '1', status: 'open' }], { id: '1', status: 'full' }))
      .toEqual([{ id: '1', status: 'full' }]);
    expect(mergeById([{ id: '1', value: 'old' }], [{ id: '1', value: 'new' }, { id: '2', value: 'new' }]))
      .toEqual([{ id: '1', value: 'new' }, { id: '2', value: 'new' }]);
  });

  it('identifies active tasks and the current shift', () => {
    expect(isActiveTask({ status: 'open' } as never)).toBe(true);
    expect(isActiveTask({ status: 'completed' } as never)).toBe(false);
    const deployment = { id: 'active', status: 'active', isCurrentShift: true } as never;
    expect(selectCurrentDeployment([{ id: 'future', isCurrentShift: false } as never, deployment]))
      .toBe(deployment);
  });

  it('expires a cached deployment when its shift ends, even if the server flag is stale', () => {
    const shiftEnd = Date.parse('2026-09-22T10:00:00.000Z');
    const deployment = {
      id: 'ended', status: 'active', isCurrentShift: true,
      shiftStart: new Date(shiftEnd - 8 * 60 * 60_000).toISOString(),
      shiftEnd: new Date(shiftEnd).toISOString(),
    } as DeploymentAssignment;
    expect(selectCurrentDeployment([deployment], shiftEnd - 1)).toBe(deployment);
    expect(selectCurrentDeployment([deployment], shiftEnd)).toBeUndefined();
    expect(selectCurrentDeployment([{ ...deployment, status: 'completed' }], shiftEnd - 1))
      .toBeUndefined();
  });
});
