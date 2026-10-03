import { createDevelopmentMapPersonnel, isMapPreviewAvailable } from './mockMapPersonnel';
import {
  clusterPersonnel,
  confirmedFixFromMember,
  effectiveMarkerTarget,
  markerMotionForFixes,
} from './officerMapMath';

it('supports preview APKs explicitly while keeping production disabled', () => {
  expect(isMapPreviewAvailable(false, 'true')).toBe(true);
  expect(isMapPreviewAvailable(true, 'false')).toBe(true);
  expect(isMapPreviewAvailable(false, 'false')).toBe(false);
  expect(isMapPreviewAvailable(false, '')).toBe(false);
});

it('provides 96 identifiable test markers that cluster and separate on zoom', () => {
  const personnel = createDevelopmentMapPersonnel({ recordedAt: '2026-09-07T00:00:00.000Z' });
  expect(personnel).toHaveLength(96);
  expect(new Set(personnel.map((member) => member.id)).size).toBe(96);
  expect(personnel.every((member) => member.isSimulated && member.name.startsWith('Test Officer'))).toBe(true);
  const overview = clusterPersonnel(personnel, 12);
  expect(overview.length).toBeLessThan(96);
  expect(overview.reduce((sum, cluster) => sum + cluster.members.length, 0)).toBe(96);
  expect(clusterPersonnel(personnel, 18)).toHaveLength(96);
});

it('exercises walking and vehicle animation with timestamped ten-second fixes', () => {
  const first = createDevelopmentMapPersonnel({ tick: 0, recordedAt: '2026-09-07T00:00:00.000Z' });
  const second = createDevelopmentMapPersonnel({ tick: 1, recordedAt: '2026-09-07T00:00:10.000Z' });
  expect(second.map((member) => member.id)).toEqual(first.map((member) => member.id));
  expect(second[0].latitude).not.toBe(first[0].latitude);
  expect(markerMotionForFixes(confirmedFixFromMember(first[0]), confirmedFixFromMember(second[0])).durationMs).toBe(500);
  expect(markerMotionForFixes(confirmedFixFromMember(first[1]), confirmedFixFromMember(second[1])).durationMs).toBe(250);
  expect(second.some((member) => member.emergencyActive)).toBe(true);
  expect(second.some((member) => member.outsideBoundary)).toBe(true);
  expect(second.some((member) => member.operationActive)).toBe(true);
});

it('allows small consecutive GPS steps to accumulate beyond the jitter radius', () => {
  const rendered: [number, number] = [121.7681, 17.4239];
  const firstSmallStep = { latitude: 17.4239, longitude: 121.76812 };
  const accumulatedStep = { latitude: 17.4239, longitude: 121.76816 };
  expect(effectiveMarkerTarget(rendered, firstSmallStep, true)).toBe(rendered);
  expect(effectiveMarkerTarget(rendered, accumulatedStep, true)).toEqual([
    accumulatedStep.longitude,
    accumulatedStep.latitude,
  ]);
});

it('moves the marker and follow target for a fresh two-meter fix even at reported zero speed', () => {
  const previous = { latitude: 17.4239, longitude: 121.7681, recordedAt: '2026-10-04T00:00:00Z', speed: 0 };
  const next = { ...previous, latitude: 17.423918, recordedAt: '2026-10-04T00:00:10Z' };
  const motion = markerMotionForFixes(previous, next);
  expect(motion.distanceMeters).toBeGreaterThan(1.9);
  expect(motion.distanceMeters).toBeLessThan(2.1);
  expect(motion.suppressJitter).toBe(false);
  expect(motion.durationMs).toBe(500);
  expect(effectiveMarkerTarget([previous.longitude, previous.latitude], next, motion.suppressJitter))
    .toEqual([next.longitude, next.latitude]);
});

it('still filters small changes without a newer confirmed GPS measurement', () => {
  const previous = { latitude: 17.4239, longitude: 121.7681, recordedAt: '2026-10-04T00:00:00Z', speed: 0 };
  expect(markerMotionForFixes(previous, { ...previous, latitude: 17.423918 }).suppressJitter).toBe(true);
});
