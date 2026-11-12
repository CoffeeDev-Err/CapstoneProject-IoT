import { act, renderHook } from '@testing-library/react-native';
import { remainingRoute, routeDistanceMeters, schedulePosition, usePatrolSchedule } from './usePatrolSchedule';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import { requestJson } from '../../services/requestJson';

jest.mock('../../services/requestJson', () => ({ requestJson: jest.fn() }));

it('updates the remaining routed distance and ETA as GPS advances, independently of marker animation', async () => {
  const geometry = { type: 'LineString', coordinates: [[121.765, 17.43], [121.766, 17.43], [121.767, 17.43]] };
  jest.mocked(requestJson).mockResolvedValueOnce({ response: { ok: true } as Response, payload: { available: true, geometry, durationSeconds: 600 } });
  const base = { id: 'ROUTE-ETA', patrolMode: 'car', shiftStart: new Date(Date.now() - 60000).toISOString(), scheduleBlocks: [
    { label: 'Market', offsetMinutes: 0, durationMinutes: 120 },
    { label: 'Park', offsetMinutes: 120, durationMinutes: 120, latitude: 17.43, longitude: 121.767 },
  ] } as DeploymentAssignment;
  const officer = { latitude: 17.43, longitude: 121.765, locationRecordedAt: new Date().toISOString() } as LivePersonnel;
  const view = await renderHook(({ current }: { current: LivePersonnel }) => usePatrolSchedule(base, current), { initialProps: { current: officer } });
  await act(async () => { await view.result.current.viewNext(); });
  const originalDistance = view.result.current.remainingMeters!;
  expect(view.result.current.etaMinutes).toBe(10);
  await view.rerender({ current: { ...officer, longitude: 121.766 } });
  expect(view.result.current.remainingMeters!).toBeCloseTo(originalDistance / 2, 0);
  expect(view.result.current.etaMinutes).toBeLessThanOrEqual(6);
  expect(view.result.current.guidance).toContain('remaining');
  expect(view.result.current.guidance).toContain('min');
  expect(routeDistanceMeters([[121.765, 17.43]])).toBe(0);
  await view.unmount();
});

it('keeps an area direction guide attached to the latest GPS fix on an indirect approach', async () => {
  const base = { id: 'AREA-1', shiftStart: new Date(Date.now() - 60000).toISOString(), scheduleBlocks: [
    { label: 'Market', offsetMinutes: 0, durationMinutes: 120 },
    { label: 'Park', offsetMinutes: 120, durationMinutes: 120, latitude: 17.432, longitude: 121.766 },
  ] } as DeploymentAssignment;
  const officer = { latitude: 17.43, longitude: 121.765, locationRecordedAt: new Date().toISOString() } as LivePersonnel;
  const view = await renderHook(({ current }: { current: LivePersonnel }) => usePatrolSchedule(base, current), { initialProps: { current: officer } });
  await act(async () => { await view.result.current.viewNext(); });
  await view.rerender({ current: { ...officer, latitude: 17.431, longitude: 121.769 } });
  const line = view.result.current.features.features.find(f => f.geometry.type === 'LineString')!;
  expect((line.geometry as GeoJSON.LineString).coordinates).toEqual([[121.769, 17.431], [121.766, 17.432]]);
  expect(view.result.current.guidance).toContain('Direction guide');
  await view.unmount();
});

it('discards late road directions after the assigned destination changes', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  const assignment = { id: 'DEP-1', patrolMode: 'car', shiftStart: '2026-11-10T00:00:00Z', scheduleBlocks: [
    { label: 'Market', coverageType: 'custom', offsetMinutes: 0, durationMinutes: 120, latitude: 17.43, longitude: 121.765, radiusMeters: 200 },
    { label: 'Park', coverageType: 'custom', offsetMinutes: 120, durationMinutes: 120, latitude: 17.431, longitude: 121.766, radiusMeters: 200 },
  ] } as DeploymentAssignment;
  const officer = { latitude: 17.43, longitude: 121.765, locationRecordedAt: '2026-11-10T00:30:00Z' } as LivePersonnel;
  let finish!: (value: Awaited<ReturnType<typeof requestJson>>) => void;
  jest.mocked(requestJson).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = await renderHook(({ deployment }: { deployment: DeploymentAssignment }) => usePatrolSchedule(deployment, officer, 'test-token'), { initialProps: { deployment: assignment } });
  let request!: Promise<void>;
  await act(async () => { request = view.result.current.viewNext(); });
  expect(view.result.current.previewNext).toBe(true);
  expect(view.result.current.guidance).toContain('last known GPS');
  await view.rerender({ deployment: { ...assignment, scheduleBlocks: assignment.scheduleBlocks!.map((b, i) => i ? { ...b, label: 'Gym', latitude: 17.432 } : b) } });
  await act(async () => {
    finish({ response: { ok: true } as Response, payload: { available: true, geometry: { type: 'LineString', coordinates: [[121.765, 17.43], [121.766, 17.431]] } } });
    await request;
  });
  expect(view.result.current.previewNext).toBe(false);
  expect(view.result.current.next?.label).toBe('Gym');
  expect(view.result.current.features.features).toHaveLength(1);
  await view.unmount();
  jest.useRealTimers();
});

it('changes the active coverage at two hours, not when a GPS reading arrives', () => {
  const assignment = { shiftStart: '2026-11-10T00:00:00Z', scheduleBlocks: [
    { offsetMinutes: 0, durationMinutes: 120 }, { offsetMinutes: 120, durationMinutes: 120 },
  ] } as DeploymentAssignment;
  expect(schedulePosition(assignment, Date.parse('2026-11-10T01:59:59Z'))).toBe(0);
  expect(schedulePosition(assignment, Date.parse('2026-11-10T02:00:00Z'))).toBe(1);
  expect(schedulePosition(assignment, Date.parse('2026-11-10T04:00:00Z'))).toBe(-1);
});
it('trims only the travelled portion of a suggested route', () => {
  const points = [[121.76, 17.43], [121.77, 17.43], [121.78, 17.43]];
  const remaining = remainingRoute(points, [121.775, 17.43]);
  expect(remaining.offRoute).toBe(false);
  expect(remaining.coordinates[0][0]).toBeCloseTo(121.775);
  expect(remaining.coordinates[1]).toEqual(points[2]);
  expect(points).toHaveLength(3);
});
it('does not remove a route segment when the officer is far from the route', () => {
  const points = [[121.76, 17.43], [121.78, 17.43]];
  expect(remainingRoute(points, [121.77, 17.45])).toEqual({ coordinates: points, offRoute: true });
});
