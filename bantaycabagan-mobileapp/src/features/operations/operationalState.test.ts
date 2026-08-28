import {
  isActiveTask,
  mergeById,
  selectCurrentDeployment,
  upsertById,
} from './operationalState';

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
    const deployment = { id: 'active', isCurrentShift: true } as never;
    expect(selectCurrentDeployment([{ id: 'future', isCurrentShift: false } as never, deployment]))
      .toBe(deployment);
  });
});
