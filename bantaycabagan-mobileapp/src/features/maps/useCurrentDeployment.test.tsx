import { act, renderHook } from '@testing-library/react-native';
import type { DeploymentAssignment } from '../../types/operations';
import { useCurrentDeployment } from './useCurrentDeployment';
import { useDeploymentPresentation } from './useDeploymentPresentation';

const start = Date.parse('2026-10-04T02:00:00Z');
const deployment = (shiftStart: number, shiftEnd: number, status = 'active') => ({
  id: 'DEP-1', acknowledged: false, status, isCurrentShift: true,
  shiftStart: new Date(shiftStart).toISOString(), shiftEnd: new Date(shiftEnd).toISOString(),
} as DeploymentAssignment);

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(start); });
afterEach(() => { jest.useRealTimers(); });

it('shows the pending check card when deployment starts after the map was already open, without a notification tap', async () => {
  const closeOfficer = jest.fn();
  const refreshOperations = jest.fn(async () => undefined);
  const view = await renderHook(({ deployments }: { deployments: DeploymentAssignment[] }) => {
    const { assignment } = useCurrentDeployment(deployments);
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
  const view = await renderHook(() => useCurrentDeployment([deployment(start + 1000, start + 3000)]));
  expect(view.result.current.assignment).toBeUndefined();
  await act(async () => { jest.advanceTimersByTime(1050); });
  expect(view.result.current.assignment?.id).toBe('DEP-1');
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(view.result.current.assignment).toBeUndefined();
});

it('keeps scheduled assignments hidden and clears the active assignment when it is removed', async () => {
  const view = await renderHook(({ deployments }: { deployments: DeploymentAssignment[] }) => (
    useCurrentDeployment(deployments)
  ), { initialProps: { deployments: [deployment(start, start + 3000, 'scheduled')] } });
  expect(view.result.current.assignment).toBeUndefined();
  await view.rerender({ deployments: [deployment(start, start + 3000)] });
  expect(view.result.current.assignment?.id).toBe('DEP-1');
  await view.rerender({ deployments: [] });
  expect(view.result.current.assignment).toBeUndefined();
});
