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
  expect(result.isVisibleOnMap).toBe(false);
});
