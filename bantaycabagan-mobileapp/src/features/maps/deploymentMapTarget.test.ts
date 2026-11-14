import type { DeploymentAssignment } from '../../types/operations';
import { resolveDeploymentMapTarget, shouldShowDeploymentPoint } from './deploymentMapTarget';
import geography from '../../constants/data/cabagan-geography.json';

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
    ...geography.barangays.features.find(feature => feature.properties.code === 'AGGUB')!.properties.center,
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

it('omits the separate POST/START pin for area and route patrols without changing their map focus', () => {
  for (const deploymentType of ['area', 'route'] as const) {
    const patrol = assignment({ deploymentType, hasDeploymentPoint: true, latitude: 17.4, longitude: 121.8 });
    expect(shouldShowDeploymentPoint(patrol)).toBe(false);
    expect(resolveDeploymentMapTarget(patrol)).toMatchObject({ latitude: 17.4, longitude: 121.8, hasExactPoint: true });
  }
  expect(shouldShowDeploymentPoint(assignment({ deploymentType: 'point' }))).toBe(true);
  expect(shouldShowDeploymentPoint(assignment({ deploymentType: undefined }))).toBe(true);
  expect(shouldShowDeploymentPoint()).toBe(false);
});
