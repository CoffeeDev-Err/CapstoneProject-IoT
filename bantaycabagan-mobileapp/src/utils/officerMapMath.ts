import type { OfficerMapPerson } from '../components/OfficerMapCanvas';

export const CLUSTER_MAX_ZOOM = 18;
export const CLUSTER_RADIUS_PIXELS = 58;

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
  const eased = easeOutCubic(progress);
  return [
    start[0] + (target[0] - start[0]) * eased,
    start[1] + (target[1] - start[1]) * eased,
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

  const projected = validPersonnel.map((member) => ({
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
