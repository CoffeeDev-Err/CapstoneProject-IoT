import type { DeploymentAssignment, OperationalTask, PoliceReport } from '../types/operations';

export type CachedSnapshot<T> = { data: T; updatedAt: string };
export type CachedOperations = {
  deployments: DeploymentAssignment[];
  upcomingDeployment: DeploymentAssignment | null;
};

export const loadCachedOperations = async (_personnelId: string): Promise<CachedSnapshot<CachedOperations> | null> => null;
export const saveCachedOperations = async (_personnelId: string, _data: CachedOperations) => undefined;
export const loadCachedTasks = async (_personnelId: string): Promise<CachedSnapshot<OperationalTask[]> | null> => null;
export const saveCachedTasks = async (_personnelId: string, _tasks: OperationalTask[]) => undefined;
export const loadCachedReports = async (_personnelId: string): Promise<CachedSnapshot<PoliceReport[]> | null> => null;
export const saveCachedReports = async (_personnelId: string, _reports: PoliceReport[]) => undefined;
export const clearCachedOperationalData = async () => undefined;

