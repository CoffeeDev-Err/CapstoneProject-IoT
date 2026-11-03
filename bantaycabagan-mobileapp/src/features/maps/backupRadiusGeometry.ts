export type BackupMapZone = {
  id: string;
  latitude: number;
  longitude: number;
  showArrivalRadius: boolean;
};

const EARTH_RADIUS_METERS = 6_371_008.8;

export function createRadiusPolygon(latitude: number, longitude: number, radiusMeters: number, steps = 72) {
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  const coordinates = Array.from({ length: steps + 1 }, (_, index) => {
    const bearing = (index / steps) * Math.PI * 2;
    const pointLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance)
      + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLongitude = longitudeRadians + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
      Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(pointLatitude),
    );
    return [pointLongitude * 180 / Math.PI, pointLatitude * 180 / Math.PI];
  });
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
  };
}
