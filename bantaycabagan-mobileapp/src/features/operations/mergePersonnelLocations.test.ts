import type { LivePersonnel } from '../../types/operations';
import { mergePersonnelLocations } from './mergePersonnelLocations';

const now = Date.parse('2026-10-04T02:00:30Z');
const latest = {
  id: 'PNP-1', name: 'Officer', source: 'gps', isOnDuty: true, isVisibleOnMap: true,
  latitude: 17.42, longitude: 121.77, locationRecordedAt: '2026-10-04T02:00:20Z',
  locationName: 'Current place',
} as LivePersonnel;
const older = { ...latest, latitude: 17.41, locationRecordedAt: '2026-10-04T02:00:00Z' };

it('keeps the latest fix when an older snapshot arrives while still applying profile updates', () => {
  const [result] = mergePersonnelLocations([latest], [{ ...older, name: 'Updated name' }], now);
  expect(result.latitude).toBe(latest.latitude);
  expect(result.locationRecordedAt).toBe(latest.locationRecordedAt);
  expect(result.locationAgeSeconds).toBe(10);
  expect(result.name).toBe('Updated name');
});

it('accepts a new stationary reading and lets the age reset without moving the coordinates', () => {
  const reading = { ...latest, locationRecordedAt: '2026-10-04T02:00:28Z' };
  expect(mergePersonnelLocations([latest], [reading], now)).toEqual([reading]);
});

it('does not retain removed officers or expose a fresh fix after duty ends', () => {
  expect(mergePersonnelLocations([latest], [], now)).toEqual([]);
  const [result] = mergePersonnelLocations([latest], [{ ...older, isOnDuty: false }], now);
  expect(result.isVisibleOnMap).toBe(false);
  expect(result.isOnDuty).toBe(false);
});

it('does not keep old readings artificially fresh', () => {
  const [result] = mergePersonnelLocations([latest], [older], now + 180_000);
  expect(result.isLocationStale).toBe(true);
  expect(result.isVisibleOnMap).toBe(true);
  expect(result.latitude).toBe(latest.latitude);
  expect(result.locationRecordedAt).toBe(latest.locationRecordedAt);
  expect(result.locationAgeSeconds).toBe(190);
  expect(result.lastKnownLocationName).toBe('Current place');
});

it('resumes with the newest measurement after sleep without preserving the stale position', () => {
  const [stale] = mergePersonnelLocations([latest], [older], now + 600_000);
  const fresh = { ...latest, latitude: 17.425, locationRecordedAt: new Date(now + 600_000).toISOString() };
  expect(mergePersonnelLocations([stale], [fresh], now + 600_000)).toEqual([fresh]);
});

it('does not resurrect a fix from the previous shift when an older snapshot follows a new duty', () => {
  const incoming = { ...older, isVisibleOnMap: false, latitude: null, longitude: null,
    activeShiftStart: '2026-10-04T02:00:25Z', activeShiftEnd: '2026-10-04T04:00:25Z' };
  expect(mergePersonnelLocations([latest], [incoming], now)).toEqual([incoming]);
});

it('keeps a newer accepted fix from this shift when an older snapshot still says GPS unavailable', () => {
  const incoming = { ...older, isVisibleOnMap: false, latitude: null, longitude: null,
    activeShiftStart: '2026-10-04T02:00:10Z', activeShiftEnd: '2026-10-04T04:00:10Z' };
  const [result] = mergePersonnelLocations([latest], [incoming], now);
  expect(result.isVisibleOnMap).toBe(true);
  expect(result.latitude).toBe(latest.latitude);
  expect(result.activeShiftStart).toBe(incoming.activeShiftStart);
});
