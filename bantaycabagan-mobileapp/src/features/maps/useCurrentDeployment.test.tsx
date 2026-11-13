import { act, renderHook } from '@testing-library/react-native';
import type { DeploymentAssignment } from '../../types/operations';
import { useCurrentDeployment } from './useCurrentDeployment';
import { useDeploymentPresentation } from './useDeploymentPresentation';

const start = Date.parse('2026-10-04T02:00:00Z');
const deployment = (shiftStart: number, shiftEnd: number, status = 'active') => ({
  id: 'DEP-1', personnelId: 'PNP-1', acknowledged: false, status, isCurrentShift: true,
  shiftStart: new Date(shiftStart).toISOString(), shiftEnd: new Date(shiftEnd).toISOString(),
} as DeploymentAssignment);

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(start); });
afterEach(() => { jest.useRealTimers(); });

it('never displays another officer deployment, even when it is the first active record', async () => {
  const other = { ...deployment(start, start + 3000), id: 'OTHER', personnelId: 'PNP-2' };
  const own = deployment(start, start + 3000);
  const view = await renderHook(({ rows }: { rows: DeploymentAssignment[] }) => useCurrentDeployment(rows, 'PNP-1'), { initialProps: { rows: [other, own] } });
  expect(view.result.current.assignment?.id).toBe('DEP-1');
  await view.rerender({ rows: [other] });
  expect(view.result.current.assignment).toBeUndefined();
});

it('shows the pending check card when deployment starts after the map was already open, without a notification tap', async () => {
  const closeOfficer = jest.fn();
  const refreshOperations = jest.fn(async () => undefined);
  const view = await renderHook(({ deployments }: { deployments: DeploymentAssignment[] }) => {
    const { assignment } = useCurrentDeployment(deployments, 'PNP-1');
    const { detailsOpen } = useDeploymentPresentation({ assignment, closeOfficer, refreshOperations });
    return { checkCard: Boolean(assignment && !assignment.acknowledged && !detailsOpen), detailsOpen };
  }, { initialProps: { deployments: [] as DeploymentAssignment[] } });
  jest.setSystemTime(start + 300_000);
  await view.rerender({ deployments: [deployment(start + 300_000, start + 600_000)] });
  expect(view.result.current.checkCard).toBe(true);
  expect(view.result.current.detailsOpen).toBe(false);
  expect(closeOfficer).toHaveBeenCalledTimes(1);
  expect(refreshOperations).not.toHaveBeenCalled();
});

it('reevaluates both shift start and shift end while the same screen stays open', async () => {
  const view = await renderHook(() => useCurrentDeployment([deployment(start + 1000, start + 3000)], 'PNP-1'));
  expect(view.result.current.assignment).toBeUndefined();
  await act(async () => { jest.advanceTimersByTime(1050); });
  expect(view.result.current.assignment?.id).toBe('DEP-1');
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(view.result.current.assignment).toBeUndefined();
});

it('keeps scheduled assignments hidden and clears the active assignment when it is removed', async () => {
  const view = await renderHook(({ deployments }: { deployments: DeploymentAssignment[] }) => (
    useCurrentDeployment(deployments, 'PNP-1')
  ), { initialProps: { deployments: [deployment(start, start + 3000, 'scheduled')] } });
  expect(view.result.current.assignment).toBeUndefined();
  await view.rerender({ deployments: [deployment(start, start + 3000)] });
  expect(view.result.current.assignment?.id).toBe('DEP-1');
  await view.rerender({ deployments: [] });
  expect(view.result.current.assignment).toBeUndefined();
});
