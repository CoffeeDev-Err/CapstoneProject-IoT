import { createHash } from 'crypto';
import contracts from '../../../contracts/domain-contracts.json';
import { CABAGAN_BARANGAYS } from '../constants/cabaganBarangays';
import {
  CABAGAN_BOUNDARY_LAT_LNG,
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
});
