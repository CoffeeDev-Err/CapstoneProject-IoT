import geography from './data/cabagan-geography.json';

// Generated contract is checked against the web/backend dataset before release.
export const CABAGAN_BOUNDARY_LAT_LNG: [number, number][] = geography.municipality.geometry.coordinates[0]
  .slice(0, -1).map(([longitude, latitude]) => [latitude, longitude]);

const boundaryLngLat = CABAGAN_BOUNDARY_LAT_LNG.map(([latitude, longitude]) => (
  [longitude, latitude] as [number, number]
));

export const CABAGAN_BOUNDARY_FEATURE = {
  type: 'Feature' as const,
  properties: { name: 'Cabagan municipal boundary' },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[...boundaryLngLat, boundaryLngLat[0]]],
  },
};

// Match the web map: tint the area outside Cabagan while leaving the
// municipality itself clear. The reversed boundary is the polygon's hole.
export const CABAGAN_OUTSIDE_MASK_FEATURE = {
  type: 'Feature' as const,
  properties: { name: 'Outside Cabagan' },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [120.8, 16.2], [122.8, 16.2], [122.8, 18.2],
        [120.8, 18.2], [120.8, 16.2],
      ],
      [...CABAGAN_BOUNDARY_FEATURE.geometry.coordinates[0]].reverse(),
    ],
  },
};

const isPointOnSegment = (
  point: [number, number],
  start: [number, number],
  end: [number, number],
) => {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-12) return false;

  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  if (dot < 0) return false;
  return dot <= (x2 - x1) ** 2 + (y2 - y1) ** 2;
};

export const isInsideCabagan = (latitude: number, longitude: number) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  let inside = false;
  for (
    let current = 0, previous = CABAGAN_BOUNDARY_LAT_LNG.length - 1;
    current < CABAGAN_BOUNDARY_LAT_LNG.length;
    previous = current, current += 1
  ) {
    const [currentLatitude, currentLongitude] = CABAGAN_BOUNDARY_LAT_LNG[current];
    const [previousLatitude, previousLongitude] = CABAGAN_BOUNDARY_LAT_LNG[previous];
    if (isPointOnSegment(
      [longitude, latitude],
      [previousLongitude, previousLatitude],
      [currentLongitude, currentLatitude],
    )) return true;
    const intersects = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < (previousLongitude - currentLongitude)
        * (latitude - currentLatitude)
        / (previousLatitude - currentLatitude)
        + currentLongitude;
    if (intersects) inside = !inside;
  }
  return inside;
};
