import { createRadiusPolygon } from './backupRadiusGeometry';

describe('backup radius geometry', () => {
  it('creates a closed map polygon around the moving requester', () => {
    const feature = createRadiusPolygon(17.4239, 121.7681, 1000, 36);
    const coordinates = feature.geometry.coordinates[0];

    expect(coordinates).toHaveLength(37);
    expect(coordinates[0]).toEqual(coordinates[coordinates.length - 1]);
    expect(coordinates.every(([longitude, latitude]) => (
      Number.isFinite(longitude) && Number.isFinite(latitude)
    ))).toBe(true);
  });
});
