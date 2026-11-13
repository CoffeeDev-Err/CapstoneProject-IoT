import { patrolBlockFeatures, patrolCoverageBounds, routeCorridorGeometry } from './patrolCoverageGeometry';
import type { PatrolScheduleBlock } from '../../types/operations';
const route = { label: 'Route 1', offsetMinutes: 0, durationMinutes: 120, coverageType: 'route', routeCorridorMeters: 100, roadDirections: true,
  routePoints: [{ latitude: 17.43, longitude: 121.765 }, { latitude: 17.431, longitude: 121.766 }],
  geometry: { type: 'LineString', coordinates: [[121.765, 17.43], [121.766, 17.43], [121.766, 17.431]] } } as PatrolScheduleBlock;
it('draws a continuous approximate 100 m buffer around the saved path, including bends and end caps', () => {
  const geometry = routeCorridorGeometry((route.geometry as GeoJSON.LineString).coordinates, 100)!;
  expect(geometry.type).toBe('MultiPolygon');
  expect(geometry.coordinates).toHaveLength(5);
  const rectangle = geometry.coordinates[2][0];
  expect(Math.abs(rectangle[0][1] - 17.43) * 111320).toBeCloseTo(100, 2);
  expect(rectangle[0]).toEqual(rectangle.at(-1));
  expect(routeCorridorGeometry([[121.765, 17.43]], 100)).toBeNull();
});
it('numbers route waypoints and only shades enforceable corridors; custom areas keep circles', () => {
  const features = patrolBlockFeatures(route, 1, true, 'car');
  expect(features.filter(f => f.properties?.kind === 'marker').map(f => f.properties?.label)).toEqual(['2.1', '2.2']);
  expect(features.find(f => f.properties?.kind === 'corridor')?.geometry.type).toBe('MultiPolygon');
  expect(patrolBlockFeatures({ ...route, roadDirections: false }, 1, false, 'car').some(f => f.properties?.kind === 'corridor')).toBe(false);
  const area = patrolBlockFeatures({ ...route, coverageType: 'custom', latitude: 17.43, longitude: 121.765, radiusMeters: 200 }, 0, false);
  expect(area[0].geometry.type).toBe('Polygon');
  expect(area[1].properties?.label).toBe('1');
  const bounds = patrolCoverageBounds({ type: 'FeatureCollection', features: [...area, ...features] });
  expect(bounds).toEqual([121.765, 17.43, 121.766, 17.431]);
});
