import { createHash } from 'crypto';
import contracts from '../../../contracts/domain-contracts.json';
import { CABAGAN_BARANGAYS } from '../constants/cabaganBarangays';
import {
  CABAGAN_BOUNDARY_LAT_LNG,
  CABAGAN_BOUNDARY_FEATURE,
  CABAGAN_OUTSIDE_MASK_FEATURE,
  isInsideCabagan,
} from '../constants/cabaganGeofence';

describe('cross-platform domain contracts', () => {
  it('keeps barangays and the geofence aligned', () => {
    expect(CABAGAN_BARANGAYS).toEqual(contracts.barangays.map(({ name }) => name));
    expect(CABAGAN_BOUNDARY_LAT_LNG).toHaveLength(contracts.geofence.coordinateCount);
    expect(createHash('sha256').update(JSON.stringify(CABAGAN_BOUNDARY_LAT_LNG)).digest('hex'))
      .toBe(contracts.geofence.sha256);
    contracts.geofence.probes.forEach((probe) => {
      expect(isInsideCabagan(probe.latitude, probe.longitude)).toBe(probe.inside);
    });
  });

  it('keeps the mobile red tint outside the Cabagan boundary', () => {
    const [outer, hole] = CABAGAN_OUTSIDE_MASK_FEATURE.geometry.coordinates;
    const signedArea = (ring: number[][]) => ring.slice(0, -1).reduce((area, [x, y], index) => {
      const [nextX, nextY] = ring[index + 1];
      return area + x * nextY - nextX * y;
    }, 0);

    expect(outer[0]).toEqual(outer[outer.length - 1]);
    expect(hole).toEqual([...CABAGAN_BOUNDARY_FEATURE.geometry.coordinates[0]].reverse());
    expect(signedArea(outer)).toBeGreaterThan(0);
    expect(signedArea(hole)).toBeLessThan(0);
  });
});

///?mockMap=clusters
