import type { DeploymentAssignment } from '../../types/operations';
import { resolveDeploymentMapTarget } from './deploymentMapTarget';

const assignment = (values: Partial<DeploymentAssignment>): DeploymentAssignment => ({
  id: 'DEP-001',
  groupId: 'GROUP-001',
  personnelId: 'officer-1',
  personnelName: 'Officer One',
  rank: 'Police Corporal',
  patrolArea: 'Barangay Aggub',
  assignedAt: '2026-10-02T23:00:00.000Z',
  latitude: null,
  longitude: null,
  isCurrentShift: true,
  acknowledged: false,
  shiftStart: '2026-10-03T00:00:00.000Z',
  shiftEnd: '2026-10-03T08:00:00.000Z',
  status: 'active',
  ...values,
});

it('focuses an area patrol on its barangay instead of the Cabagan default', () => {
  expect(resolveDeploymentMapTarget(assignment({
    coverageBarangays: ['Aggub'],
    deploymentType: 'area',
    hasDeploymentPoint: false,
  }))).toEqual({
    latitude: 17.4127,
    longitude: 121.7341,
    hasExactPoint: false,
    zoom: 14.5,
  });
});

it('prioritizes an exact fixed post over the patrol-area center', () => {
  expect(resolveDeploymentMapTarget(assignment({
    latitude: 17.4,
    longitude: 121.8,
    deploymentType: 'point',
    hasDeploymentPoint: true,
  }))).toMatchObject({
    latitude: 17.4,
    longitude: 121.8,
    hasExactPoint: true,
    zoom: 16,
  });
});
