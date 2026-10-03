type DeploymentRefreshListener = () => void;

const listeners = new Set<DeploymentRefreshListener>();

export const requestDeploymentRefresh = () => {
  listeners.forEach((listener) => listener());
};

export const subscribeDeploymentRefresh = (listener: DeploymentRefreshListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isDeploymentNotificationData = (data?: Record<string, unknown> | null) => (
  data?.referenceType === 'deployment' || typeof data?.assignmentId === 'string'
);
