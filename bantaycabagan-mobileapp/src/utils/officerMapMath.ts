import type { OfficerMapPerson } from '../components/OfficerMapCanvas';

export const CLUSTER_MAX_ZOOM = 18;
export const CLUSTER_RADIUS_PIXELS = 58;
export const GPS_UPDATE_INTERVAL_MS = 10_000;
export const WALKING_MARKER_ANIMATION_DURATION_MS = 2_000;
export const VEHICLE_MARKER_ANIMATION_DURATION_MS = 900;
export const STATIONARY_JITTER_DISTANCE_METERS = 5;
export const STATIONARY_SPEED_MAX_KMH = 2;
export const VEHICLE_SPEED_MIN_KMH = 10;
export const MARKER_ANIMATION_DURATION_MS = WALKING_MARKER_ANIMATION_DURATION_MS;

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_REASONABLE_SPEED_KMH = 300;
const MIN_SPEED_SAMPLE_MS = 1_000;
const MAX_SPEED_SAMPLE_MS = 5 * 60_000;

export type ConfirmedGpsFix = {
  latitude: number;
  longitude: number;
  recordedAt?: string | null;
  speed?: number | null;
};

const validSpeed = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const speed = Number(value);
  return Number.isFinite(speed) && speed >= 0 && speed <= MAX_REASONABLE_SPEED_KMH
    ? speed
    : null;
};

const timestampMs = (value: unknown) => {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const confirmedFixFromMember = (member: OfficerMapPerson): ConfirmedGpsFix => ({
  latitude: Number(member.latitude),
  longitude: Number(member.longitude),
  recordedAt: member.locationRecordedAt || member.lastUpdated || null,
  speed: validSpeed(member.speed),
});

export const distanceMetersBetweenFixes = (
  from: ConfirmedGpsFix,
  target: ConfirmedGpsFix,
) => {
  const values = [from.latitude, from.longitude, target.latitude, target.longitude];
  if (!values.every(Number.isFinite)) return null;

  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(target.latitude - from.latitude);
  const longitudeDelta = toRadians(target.longitude - from.longitude);
  const fromLatitudeRadians = toRadians(from.latitude);
  const targetLatitudeRadians = toRadians(target.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitudeRadians) * Math.cos(targetLatitudeRadians)
      * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

export const calculatedSpeedKmhBetweenFixes = (
  from: ConfirmedGpsFix,
  target: ConfirmedGpsFix,
) => {
  const fromTime = timestampMs(from.recordedAt);
  const targetTime = timestampMs(target.recordedAt);
  const elapsedMs = targetTime !== null && fromTime !== null ? targetTime - fromTime : null;
  const distanceMeters = distanceMetersBetweenFixes(from, target);
  if (
    elapsedMs === null
    || elapsedMs < MIN_SPEED_SAMPLE_MS
    || elapsedMs > MAX_SPEED_SAMPLE_MS
    || distanceMeters === null
  ) return null;

  return validSpeed((distanceMeters / elapsedMs) * 3_600);
};

export const resolveMotionSpeedKmh = (from: ConfirmedGpsFix, target: ConfirmedGpsFix) => {
  const reportedSpeed = validSpeed(target.speed);
  const calculatedSpeed = calculatedSpeedKmhBetweenFixes(from, target);
  if (calculatedSpeed === null) return reportedSpeed;
  if (reportedSpeed === null) return calculatedSpeed;

  const tolerance = Math.max(8, calculatedSpeed * 0.6);
  return Math.abs(reportedSpeed - calculatedSpeed) > tolerance
    ? calculatedSpeed
    : reportedSpeed;
};

export const markerMotionForFixes = (
  from: ConfirmedGpsFix | undefined,
  target: ConfirmedGpsFix,
) => {
  if (!from) return { durationMs: 0, distanceMeters: 0, speedKmh: null, suppressJitter: false };

  const distanceMeters = distanceMetersBetweenFixes(from, target);
  const calculatedSpeed = calculatedSpeedKmhBetweenFixes(from, target);
  const speedKmh = resolveMotionSpeedKmh(from, target);
  const suppressJitter = distanceMeters !== null
    && distanceMeters <= STATIONARY_JITTER_DISTANCE_METERS
    && (calculatedSpeed ?? speedKmh ?? 0) <= STATIONARY_SPEED_MAX_KMH;

  return {
    durationMs: speedKmh !== null && speedKmh > VEHICLE_SPEED_MIN_KMH
      ? VEHICLE_MARKER_ANIMATION_DURATION_MS
      : WALKING_MARKER_ANIMATION_DURATION_MS,
    distanceMeters,
    speedKmh,
    suppressJitter,
  };
};

export type MarkerTone = 'duty' | 'operation' | 'critical';

export type PersonnelCluster = {
  id: string;
  latitude: number;
  longitude: number;
  members: OfficerMapPerson[];
  tone: MarkerTone;
};

export const markerTone = (member: OfficerMapPerson): MarkerTone => {
  if (member.emergencyActive || member.outsideBoundary) return 'critical';
  if (member.operationActive) return 'operation';
  return 'duty';
};

export const markerToneColor = (tone: MarkerTone) => ({
  duty: '#2563EB',
  operation: '#38BDF8',
  critical: '#DC2626',
}[tone]);

export const easeOutCubic = (progress: number) => {
  const constrainedProgress = Math.max(0, Math.min(1, progress));
  return 1 - (1 - constrainedProgress) ** 3;
};

export const interpolatePosition = (
  start: [number, number],
  target: [number, number],
  progress: number,
): [number, number] => {
  // GPS fixes arrive every ten seconds. A short linear catch-up reaches the
  // newest confirmed fix quickly without predicting an unconfirmed position.
  const interpolatedProgress = Math.max(0, Math.min(1, progress));
  return [
    start[0] + (target[0] - start[0]) * interpolatedProgress,
    start[1] + (target[1] - start[1]) * interpolatedProgress,
  ];
};

const worldPixel = (longitude: number, latitude: number, zoom: number) => {
  const worldSize = 256 * 2 ** zoom;
  const constrainedLatitude = Math.max(-85.051129, Math.min(85.051129, latitude));
  const sine = Math.sin(constrainedLatitude * Math.PI / 180);
  return {
    x: (longitude + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize,
  };
};

export const clusterPersonnel = (
  personnel: OfficerMapPerson[],
  zoom: number,
): PersonnelCluster[] => {
  const validPersonnel = personnel.filter((member) => (
    Number.isFinite(Number(member.latitude)) && Number.isFinite(Number(member.longitude))
  ));

  if (zoom >= CLUSTER_MAX_ZOOM) {
    return validPersonnel.map((member) => ({
      id: member.id,
      latitude: Number(member.latitude),
      longitude: Number(member.longitude),
      members: [member],
      tone: markerTone(member),
    }));
  }

  // The backend normally returns personnel by name, but identity changes can
  // reorder that list. Sorting here prevents cluster membership from changing
  // merely because the input array arrived in a different order.
  const projected = [...validPersonnel]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((member) => ({
    member,
    pixel: worldPixel(Number(member.longitude), Number(member.latitude), zoom),
    }));
  const spatialGrid = new Map<string, number[]>();
  projected.forEach(({ pixel }, index) => {
    const cellX = Math.floor(pixel.x / CLUSTER_RADIUS_PIXELS);
    const cellY = Math.floor(pixel.y / CLUSTER_RADIUS_PIXELS);
    const key = `${cellX}:${cellY}`;
    const cell = spatialGrid.get(key) || [];
    cell.push(index);
    spatialGrid.set(key, cell);
  });

  const visited = new Set<number>();
  const clusters: PersonnelCluster[] = [];
  projected.forEach((_, seedIndex) => {
    if (visited.has(seedIndex)) return;

    visited.add(seedIndex);
    const memberIndexes = [seedIndex];
    const seed = projected[seedIndex];
    const cellX = Math.floor(seed.pixel.x / CLUSTER_RADIUS_PIXELS);
    const cellY = Math.floor(seed.pixel.y / CLUSTER_RADIUS_PIXELS);

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const candidates = spatialGrid.get(`${cellX + offsetX}:${cellY + offsetY}`) || [];
        candidates.forEach((candidateIndex) => {
          if (visited.has(candidateIndex)) return;
          const candidate = projected[candidateIndex];
          if (Math.hypot(
            candidate.pixel.x - seed.pixel.x,
            candidate.pixel.y - seed.pixel.y,
          ) <= CLUSTER_RADIUS_PIXELS) {
            visited.add(candidateIndex);
            memberIndexes.push(candidateIndex);
          }
        });
      }
    }

    const members = memberIndexes.map((index) => projected[index].member);
    const critical = members.some((member) => markerTone(member) === 'critical');
    const operation = members.some((member) => markerTone(member) === 'operation');
    clusters.push({
      id: members.map((member) => member.id).sort().join('-'),
      latitude: members.reduce((sum, member) => sum + Number(member.latitude), 0) / members.length,
      longitude: members.reduce((sum, member) => sum + Number(member.longitude), 0) / members.length,
      members,
      tone: critical ? 'critical' : (operation ? 'operation' : 'duty'),
    });
  });

  return clusters;
};
