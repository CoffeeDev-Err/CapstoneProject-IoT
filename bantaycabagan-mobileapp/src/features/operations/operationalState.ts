import type { DeploymentAssignment, OperationalTask } from '../../types/operations';

export const upsertById = <T extends { id: string }>(items: T[], incoming: T) => {
  const exists = items.some((item) => item.id === incoming.id);
  return exists
    ? items.map((item) => (item.id === incoming.id ? incoming : item))
    : [incoming, ...items];
};

export const mergeById = <T extends { id: string }>(first: T[], second: T[]) => {
  const merged = new Map<string, T>();
  [...first, ...second].forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
};

export const isActiveTask = (task: OperationalTask) => (
  task.status === 'open' || task.status === 'full'
);

export const isDeploymentActiveNow = (deployment: DeploymentAssignment, now = Date.now()) => {
  if (deployment.status !== 'active' || deployment.isCurrentShift === false) return false;
  const start = deployment.shiftStart ? Date.parse(deployment.shiftStart) : null;
  const end = deployment.shiftEnd ? Date.parse(deployment.shiftEnd) : null;
  return (start === null || (Number.isFinite(start) && start <= now))
    && (end === null || (Number.isFinite(end) && end > now));
};

export const selectCurrentDeployment = (deployments: DeploymentAssignment[], now = Date.now()) => (
  deployments.find((deployment) => isDeploymentActiveNow(deployment, now))
);

export const selectPersonnelDeployment = (
  deployments: DeploymentAssignment[],
  personnelId: string,
) => deployments.find((deployment) => deployment.personnelId === personnelId)
  || deployments[0];
