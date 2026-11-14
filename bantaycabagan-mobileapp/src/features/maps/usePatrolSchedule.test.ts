import { act, renderHook, waitFor } from '@testing-library/react-native';
import { remainingRoute, routeDistanceMeters, schedulePosition, usePatrolSchedule } from './usePatrolSchedule';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import { requestJson } from '../../services/requestJson';

jest.mock('../../services/requestJson', () => ({ requestJson: jest.fn() }));

it('routes toward the saved access reference while keeping the interior number marker', async () => {
  jest.mocked(requestJson).mockClear();
  jest.mocked(requestJson).mockResolvedValueOnce({ response: { ok: true } as Response, payload: { available: false } });
  const navigationPoint = { latitude: 17.432, longitude: 121.766 };
  const base = { status: 'active', id: 'BARANGAY', deploymentType: 'area', shiftStart: new Date(Date.now() - 60000).toISOString(), scheduleBlocks: [
    { label: 'Current', coverageType: 'custom', radiusMeters: 200, latitude: 17.43, longitude: 121.765, offsetMinutes: 0, durationMinutes: 120 },
    { label: 'Next barangay', coverageType: 'barangay', latitude: 17.433, longitude: 121.767, navigationPoint, offsetMinutes: 120, durationMinutes: 120 },
  ] } as DeploymentAssignment;
  const officer = { latitude: 17.43, longitude: 121.765, locationRecordedAt: new Date().toISOString() } as LivePersonnel;
  const view = await renderHook(() => usePatrolSchedule(base, officer));
  await act(async () => { await view.result.current.viewBlock(1); });
  const request = JSON.parse(jest.mocked(requestJson).mock.calls.at(-1)![1]!.body as string);
  expect(request.points[1]).toEqual(navigationPoint);
  const marker = view.result.current.features.features.find(f => f.properties?.kind === 'marker' && f.properties?.label === '2')!;
  expect((marker.geometry as GeoJSON.Point).coordinates).toEqual([121.767, 17.433]);
  await view.unmount();
});

it('previews any own numbered area without changing active coverage and requests an automatic road guide', async () => {
  const geometry = { type: 'LineString', coordinates: [[121.765, 17.43], [121.768, 17.432]] };
  jest.mocked(requestJson).mockResolvedValueOnce({ response: { ok: true } as Response, payload: { available: true, geometry } });
  const base = { status: 'active', id: 'OWN', deploymentType: 'area', shiftStart: new Date(Date.now() - 60000).toISOString(), scheduleBlocks: [0, 1, 2].map(i => ({ label: `Area ${i + 1}`, coverageType: 'custom', radiusMeters: 200, latitude: 17.43 + i * 0.001, longitude: 121.765 + i * 0.001, offsetMinutes: i * 120, durationMinutes: 120 })) } as DeploymentAssignment;
  const officer = { latitude: 17.43, longitude: 121.765, locationRecordedAt: new Date().toISOString() } as LivePersonnel;
  const view = await renderHook(() => usePatrolSchedule(base, officer, 'test-token'));
  await act(async () => { await view.result.current.viewBlock(2); });
  expect(view.result.current.index).toBe(0);
  expect(view.result.current.previewBlock?.label).toBe('Area 3');
  expect(view.result.current.features.features.filter(f => f.properties?.kind === 'marker').map(f => f.properties?.label)).toEqual(['1', '3']);
  expect(JSON.parse(jest.mocked(requestJson).mock.calls.at(-1)![1]!.body as string).mode).toBe('car');
  await act(async () => { view.result.current.closePreview(); });
  expect(view.result.current.previewNext).toBe(false);
  expect(view.result.current.features.features.filter(f => f.properties?.kind === 'marker').map(f => f.properties?.label)).toEqual(['1']);
  await view.unmount();
});

it('updates the remaining routed distance and ETA as GPS advances, independently of marker animation', async () => {
  const geometry = { type: 'LineString', coordinates: [[121.765, 17.43], [121.766, 17.43], [121.767, 17.43]] };
  jest.mocked(requestJson).mockResolvedValueOnce({ response: { ok: true } as Response, payload: { available: true, geometry, durationSeconds: 600 } });
  const base = { status: 'active', id: 'ROUTE-ETA', patrolMode: 'car', shiftStart: new Date(Date.now() - 60000).toISOString(), scheduleBlocks: [
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
  const base = { status: 'active', id: 'AREA-1', shiftStart: new Date(Date.now() - 60000).toISOString(), scheduleBlocks: [
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
  const assignment = { status: 'active', id: 'DEP-1', patrolMode: 'car', shiftStart: '2026-11-10T00:00:00Z', scheduleBlocks: [
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
  expect(view.result.current.features.features.map(f => f.properties?.kind)).toEqual(['coverage', 'marker']);
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

it('previews coverage without requesting directions from a previous duty fix, including after acknowledgement', async () => {
  jest.mocked(requestJson).mockClear();
  const now = Date.now();
  const base = { id: 'NEW-DUTY', status: 'active', isCurrentShift: true, acknowledged: false,
    shiftStart: new Date(now - 60_000).toISOString(), shiftEnd: new Date(now + 180_000).toISOString(),
    scheduleBlocks: [0, 1].map(i => ({ label: `Area ${i + 1}`, coverageType: 'custom', radiusMeters: 200,
      offsetMinutes: i * 2, durationMinutes: 2, latitude: 17.43 + i * 0.001, longitude: 121.765 })),
  } as DeploymentAssignment;
  const officer = { isOnDuty: true, isVisibleOnMap: true, latitude: 17.43, longitude: 121.765,
    locationRecordedAt: new Date(now - 120_000).toISOString() } as LivePersonnel;
  const view = await renderHook(({ deployment }: { deployment: DeploymentAssignment }) => usePatrolSchedule(deployment, officer), { initialProps: { deployment: base } });
  await act(async () => { await view.result.current.viewBlock(1); });
  await view.rerender({ deployment: { ...base, acknowledged: true } });
  expect(requestJson).not.toHaveBeenCalled();
  expect(view.result.current.previewBlock?.label).toBe('Area 2');
  expect(view.result.current.features.features.filter(f => f.properties?.kind === 'marker')).toHaveLength(2);
  expect(view.result.current.features.features.some(f => f.properties?.kind === 'transition')).toBe(false);
  expect(view.result.current.guidance).toContain('Waiting for a GPS reading from this duty');
  expect(view.result.current.guidance).not.toContain('last known');
  await view.unmount();
});

it('discards an in-flight route when duty ends and never restores its remaining-distance overlay', async () => {
  jest.useFakeTimers();
  const now = Date.parse('2026-11-14T06:00:00Z');
  jest.setSystemTime(now);
  const base = { id: 'ENDING', status: 'active', shiftStart: new Date(now - 60_000).toISOString(), shiftEnd: new Date(now + 5_000).toISOString(),
    scheduleBlocks: [0, 1].map(i => ({ label: `Area ${i + 1}`, offsetMinutes: i * 2, durationMinutes: 2, latitude: 17.43, longitude: 121.765 + i * 0.001 })),
  } as DeploymentAssignment;
  const officer = { latitude: 17.43, longitude: 121.765, locationRecordedAt: new Date(now).toISOString() } as LivePersonnel;
  let finish!: (value: Awaited<ReturnType<typeof requestJson>>) => void;
  jest.mocked(requestJson).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = await renderHook(({ deployment }: { deployment: DeploymentAssignment | undefined }) => usePatrolSchedule(deployment, officer), { initialProps: { deployment: base as DeploymentAssignment | undefined } });
  let request!: Promise<void>;
  await act(async () => { request = view.result.current.viewNext(); });
  await act(async () => { jest.advanceTimersByTime(10_000); });
  await view.rerender({ deployment: undefined });
  await act(async () => {
    finish({ response: { ok: true } as Response, payload: { available: true, geometry: { type: 'LineString', coordinates: [[121.765, 17.43], [121.766, 17.43]] } } });
    await request;
  });
  expect(view.result.current.remainingMeters).toBeNull();
  expect(view.result.current.previewNext).toBe(false);
  expect(view.result.current.features.features).toEqual([]);
  await view.unmount();
  jest.useRealTimers();
});

it('starts preview directions when the first fix from this duty arrives instead of reusing the prior shift', async () => {
  jest.mocked(requestJson).mockClear();
  const now = Date.now();
  const base = { id: 'FIRST-FIX', status: 'active', deploymentType: 'area', shiftStart: new Date(now - 60_000).toISOString(),
    scheduleBlocks: [0, 1].map(i => ({ label: `Area ${i + 1}`, offsetMinutes: i * 120, durationMinutes: 120, latitude: 17.43, longitude: 121.765 + i * 0.001 })),
  } as DeploymentAssignment;
  const officer = { latitude: 17.42, longitude: 121.764, locationRecordedAt: new Date(now - 120_000).toISOString() } as LivePersonnel;
  const view = await renderHook(({ current }: { current: LivePersonnel }) => usePatrolSchedule(base, current), { initialProps: { current: officer } });
  await act(async () => { await view.result.current.viewBlock(1); });
  expect(requestJson).not.toHaveBeenCalled();
  jest.mocked(requestJson).mockResolvedValueOnce({ response: { ok: true } as Response, payload: { available: true, geometry: { type: 'LineString', coordinates: [[121.765, 17.43], [121.766, 17.43]] } } });
  await view.rerender({ current: { ...officer, latitude: 17.43, longitude: 121.765, locationRecordedAt: new Date(now).toISOString() } });
  await waitFor(() => expect(view.result.current.guidance).toContain('Suggested road route'));
  expect(requestJson).toHaveBeenCalledTimes(1);
  expect(JSON.parse(jest.mocked(requestJson).mock.calls[0][1]!.body as string).points[0]).toEqual({ latitude: 17.43, longitude: 121.765 });
  await view.unmount();
});
