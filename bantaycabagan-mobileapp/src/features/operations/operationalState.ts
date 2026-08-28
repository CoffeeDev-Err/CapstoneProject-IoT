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

export const selectCurrentDeployment = (deployments: DeploymentAssignment[]) => (
  deployments.find((deployment) => deployment.isCurrentShift !== false)
);

export const selectPersonnelDeployment = (
  deployments: DeploymentAssignment[],
  personnelId: string,
) => deployments.find((deployment) => deployment.personnelId === personnelId)
  || deployments[0];
