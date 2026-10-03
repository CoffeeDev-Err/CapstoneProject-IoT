import type { DeploymentAssignment } from '../../types/operations';
import {
  CABAGAN_BARANGAY_CENTERS,
  DEFAULT_CABAGAN_PATROL_CENTER,
  normalizePatrolAreaCode,
  SPECIAL_PATROL_CENTERS,
  type PatrolCenter,
} from '../../constants/cabaganPatrolCenters';

export type DeploymentMapTarget = PatrolCenter & {
  hasExactPoint: boolean;
  zoom: number;
};

const hasCoordinate = (value?: number | null) => Number.isFinite(value);

const firstCatalogCenter = (assignment?: DeploymentAssignment) => {
  if (!assignment) return null;
  const labels = [
    ...(assignment.coverageBarangays || []),
    assignment.patrolArea,
  ];
  for (const label of labels) {
    const center = CABAGAN_BARANGAY_CENTERS[normalizePatrolAreaCode(label)];
    if (center) return center;
  }
  const patrolAreaId = String(assignment.patrolAreaId || '').trim().toLowerCase();
  return SPECIAL_PATROL_CENTERS[patrolAreaId] || null;
};

export const resolveDeploymentMapTarget = (
  assignment?: DeploymentAssignment,
): DeploymentMapTarget => {
  if (assignment && hasCoordinate(assignment.latitude) && hasCoordinate(assignment.longitude)
    && assignment.hasDeploymentPoint !== false) {
    return {
      latitude: Number(assignment.latitude),
      longitude: Number(assignment.longitude),
      hasExactPoint: true,
      zoom: assignment.deploymentType === 'route' ? 15 : 16,
    };
  }

  const center = firstCatalogCenter(assignment) || DEFAULT_CABAGAN_PATROL_CENTER;
  return {
    ...center,
    hasExactPoint: false,
    zoom: assignment?.deploymentType === 'route' ? 14 : 14.5,
  };
};
