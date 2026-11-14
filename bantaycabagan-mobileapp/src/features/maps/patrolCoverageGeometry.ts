import type { PatrolScheduleBlock } from '../../types/operations';
import { createRadiusPolygon } from './backupRadiusGeometry';

export const routeHasCoverage = (block: PatrolScheduleBlock, mode?: string) => block.geometry?.type === 'LineString'
  && (mode === 'walk' || block.roadDirections === true);

export function patrolCoverageBounds(collection?: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  const preview = collection?.features.some(feature => feature.properties?.next && feature.properties?.kind === 'coverage');
  const points: number[][] = [];
  const collect = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      if (Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) points.push(coordinates);
    } else coordinates.forEach(collect);
  };
  collection?.features.filter(feature => feature.properties?.kind === 'coverage' && Boolean(feature.properties?.next) === Boolean(preview)).forEach(feature => {
    if ('coordinates' in feature.geometry) collect(feature.geometry.coordinates);
  });
  if (!points.length) return null;
  return points.reduce<[number, number, number, number]>((bounds, [lng, lat]) => [Math.min(bounds[0], lng), Math.min(bounds[1], lat), Math.max(bounds[2], lng), Math.max(bounds[3], lat)], [Infinity, Infinity, -Infinity, -Infinity]);
}

// Visual buffer only. The server continues to evaluate the saved path and GPS tolerance.
export function routeCorridorGeometry(points: number[][], meters: number): GeoJSON.MultiPolygon | null {
  if (points.length < 2 || !Number.isFinite(meters) || meters <= 0 || points.some(p => p.length < 2 || !p.slice(0, 2).every(Number.isFinite))) return null;
  const polygons: number[][][][] = [];
  points.forEach((point, index) => {
    polygons.push(createRadiusPolygon(point[1], point[0], meters, 16).geometry.coordinates);
    if (!index) return;
    const previous = points[index - 1];
    const scale = Math.cos((point[1] + previous[1]) / 2 * Math.PI / 180);
    const x = (point[0] - previous[0]) * scale, y = point[1] - previous[1];
    const length = Math.hypot(x, y);
    if (!length || scale < 0.01) return;
    const dx = -y / length * meters / (111320 * scale), dy = x / length * meters / 111320;
    const a = [previous[0] + dx, previous[1] + dy], b = [point[0] + dx, point[1] + dy];
    const c = [point[0] - dx, point[1] - dy], d = [previous[0] - dx, previous[1] - dy];
    polygons.push([[a, b, c, d, a]]);
  });
  return { type: 'MultiPolygon', coordinates: polygons };
}

export function patrolBlockFeatures(block: PatrolScheduleBlock | undefined, index: number, next: boolean, mode?: string): GeoJSON.Feature[] {
  if (!block) return [];
  const properties = { next, blockIndex: index, coverageType: block.coverageType };
  const features: GeoJSON.Feature[] = [];
  if (block.coverageType === 'custom' && Number.isFinite(block.latitude) && Number.isFinite(block.longitude)) {
    const circle = createRadiusPolygon(block.latitude!, block.longitude!, block.radiusMeters!);
    features.push({ ...circle, properties: { ...properties, kind: 'coverage' } });
  } else if (block.geometry) {
    if (block.coverageType === 'route' && block.geometry.type === 'LineString' && routeHasCoverage(block, mode)) {
      const corridor = routeCorridorGeometry(block.geometry.coordinates, block.routeCorridorMeters ?? 100);
      if (corridor) features.push({ type: 'Feature', properties: { ...properties, kind: 'corridor' }, geometry: corridor });
    }
    features.push({ type: 'Feature', properties: { ...properties, kind: 'coverage' }, geometry: block.geometry });
  }
  const markers = block.coverageType === 'route' ? block.routePoints || []
    : Number.isFinite(block.latitude) && Number.isFinite(block.longitude) ? [{ latitude: block.latitude!, longitude: block.longitude! }] : [];
  markers.forEach((point, waypoint) => features.push({ type: 'Feature', properties: { ...properties, kind: 'marker', label: block.coverageType === 'route' ? `${index + 1}.${waypoint + 1}` : String(index + 1) }, geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] } }));
  return features;
}
