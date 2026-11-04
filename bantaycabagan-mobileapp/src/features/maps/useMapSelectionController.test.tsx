import { act, renderHook } from '@testing-library/react-native';
import type { OfficerMapCanvasHandle, OfficerMapPerson } from '../../components/OfficerMapCanvas';
import type { LivePersonnel } from '../../types/operations';
import { useMapSelectionController } from './useMapSelectionController';

const member = (id: string, latitude: number): LivePersonnel => ({
  id,
  name: id,
  badge: id,
  locationName: 'Cabagan',
  latitude,
  longitude: 121.76,
  isLocationStale: false,
  isVisibleOnMap: true,
} as LivePersonnel);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('stages a safe marker transition when returning from another officer to the current officer', async () => {
  const current = member('current', 17.42);
  const other = member('other', 17.43);
  const personnel = [current, other];
  const view = await renderHook(() => useMapSelectionController({
    currentPersonnelId: current.id,
    mapMode: 'street',
    mapPersonnel: personnel as OfficerMapPerson[],
    onMapInteractionEnd: jest.fn(),
    onMapInteractionStart: jest.fn(),
    visiblePersonnel: personnel,
  }));
  const focusOfficer = jest.fn();
  view.result.current.nativeMapRef.current = {
    fitPersonnel: jest.fn(),
    focusDeployment: jest.fn(),
    focusOfficer,
  } as OfficerMapCanvasHandle;

  await act(async () => view.result.current.setSelectedOfficerId(other.id));
  await act(async () => view.result.current.handleLocateOfficer());
  await act(async () => jest.runOnlyPendingTimers());
  expect(view.result.current.activeFollowedOfficerId).toBe(other.id);
  expect(focusOfficer).toHaveBeenLastCalledWith(other.id);

  await act(async () => view.result.current.focusCurrentOfficer());
  expect(view.result.current.activeFollowedOfficerId).toBeNull();
  expect(focusOfficer).not.toHaveBeenCalledWith(current.id);

  await act(async () => jest.runOnlyPendingTimers());
  expect(view.result.current.activeFollowedOfficerId).toBe(current.id);
  await act(async () => jest.runOnlyPendingTimers());
  expect(focusOfficer).toHaveBeenLastCalledWith(current.id);
});
