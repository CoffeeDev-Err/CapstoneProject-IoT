import { act, renderHook } from '@testing-library/react-native';
import type { DeploymentAssignment } from '../../types/operations';
import { useDeploymentPresentation } from './useDeploymentPresentation';

const deployment = (id: string, acknowledged = false) => ({
  id, acknowledged, status: 'active', patrolArea: 'Barangay Aggub',
} as DeploymentAssignment);

it('shows the compact check card when a new assignment arrives and leaves details collapsed after acknowledgement', async () => {
  const closeOfficer = jest.fn();
  const refreshOperations = jest.fn(async () => undefined);
  const view = await renderHook(({ assignment }: { assignment?: DeploymentAssignment }) => (
    useDeploymentPresentation({ assignment, closeOfficer, refreshOperations })
  ), { initialProps: { assignment: undefined as DeploymentAssignment | undefined } });
  await view.rerender({ assignment: deployment('DEP-1') });
  expect(closeOfficer).toHaveBeenCalledTimes(1);
  expect(view.result.current.detailsOpen).toBe(false);
  await act(async () => view.result.current.setDetailsOpen(true));
  expect(view.result.current.detailsOpen).toBe(true);
  await view.rerender({ assignment: deployment('DEP-2') });
  expect(view.result.current.detailsOpen).toBe(false);
  await view.rerender({ assignment: deployment('DEP-2', true) });
  expect(view.result.current.detailsOpen).toBe(false);
});

it('refreshes on a notification tap and preserves the check card for pending assignments', async () => {
  const refreshOperations = jest.fn(async () => undefined);
  const view = await renderHook(({ requestId }: { requestId?: number }) => (
    useDeploymentPresentation({ assignment: deployment('DEP-1'), notificationId: 'DEP-1',
      notificationRequestId: requestId, closeOfficer: jest.fn(), refreshOperations })
  ), { initialProps: { requestId: undefined as number | undefined } });
  await view.rerender({ requestId: 1 });
  expect(refreshOperations).toHaveBeenCalledTimes(1);
  expect(view.result.current.detailsOpen).toBe(false);
});

it('opens acknowledged assignment details even when notification params arrive after the same assignment was loaded', async () => {
  const closeOfficer = jest.fn();
  const refreshOperations = jest.fn(async () => undefined);
  const assignment = deployment('DEP-1', true);
  const view = await renderHook(({ requestId }: { requestId?: number }) => (
    useDeploymentPresentation({ assignment, notificationId: 'DEP-1',
      notificationRequestId: requestId, closeOfficer, refreshOperations })
  ), { initialProps: { requestId: undefined as number | undefined } });
  await view.rerender({ requestId: 1 });
  expect(view.result.current.detailsOpen).toBe(true);
  await act(async () => view.result.current.setDetailsOpen(false));
  await view.rerender({ requestId: 2 });
  expect(view.result.current.detailsOpen).toBe(true);
});

it('waits for the referenced assignment instead of expanding an unrelated deployment', async () => {
  const closeOfficer = jest.fn();
  const refreshOperations = jest.fn(async () => undefined);
  const view = await renderHook(({ assignment }: { assignment: DeploymentAssignment }) => (
    useDeploymentPresentation({ assignment, notificationId: 'DEP-2',
      notificationRequestId: 1, closeOfficer, refreshOperations })
  ), { initialProps: { assignment: deployment('DEP-1', true) } });
  expect(view.result.current.detailsOpen).toBe(false);
  await view.rerender({ assignment: deployment('DEP-2', true) });
  expect(view.result.current.detailsOpen).toBe(true);
});
