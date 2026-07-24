import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  acceptOperationalTask,
  fetchOperations,
  operationsSocket,
  requestBackup,
  resolveIncidentReport,
  submitPoliceReport,
} from '../services/operationsApi';
import type {
  DeploymentAssignment,
  LivePersonnel,
  OperationalTask,
  PoliceReport,
  SubmitReportInput,
} from '../types/operations';

type OperationalContextValue = {
  tasks: OperationalTask[];
  reports: PoliceReport[];
  deployments: DeploymentAssignment[];
  personnel: LivePersonnel[];
  isConnected: boolean;
  isLoading: boolean;
  acceptTask: (taskId: string) => Promise<void>;
  createBackupRequest: () => Promise<void>;
  submitReport: (input: SubmitReportInput) => Promise<void>;
  resolveReport: (reportId: string, resolutionNotes: string) => Promise<void>;
};

const OperationalContext = createContext<OperationalContextValue | null>(null);

const upsertById = <T extends { id: string }>(items: T[], incoming: T) => {
  const exists = items.some((item) => item.id === incoming.id);
  return exists
    ? items.map((item) => (item.id === incoming.id ? incoming : item))
    : [incoming, ...items];
};

export function OperationalProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [reports, setReports] = useState<PoliceReport[]>([]);
  const [deployments, setDeployments] = useState<DeploymentAssignment[]>([]);
  const [personnel, setPersonnel] = useState<LivePersonnel[]>([]);
  const [isConnected, setIsConnected] = useState(operationsSocket.connected);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOperations()
      .then((payload) => {
        setTasks(payload.tasks);
        setReports(payload.reports);
        setDeployments(payload.deployments);
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onPersonnelBootstrap = (payload: LivePersonnel[]) => setPersonnel(payload);
    const onPersonnelUpdate = (payload: LivePersonnel[]) => setPersonnel(payload);
    const onTasksBootstrap = (payload: OperationalTask[]) => setTasks(payload);
    const onTaskCreated = (task: OperationalTask) => setTasks((items) => upsertById(items, task));
    const onTaskUpdated = (task: OperationalTask) => setTasks((items) => upsertById(items, task));
    const onReportSubmitted = (report: PoliceReport) => {
      if (report.personnel_id === 'pcpl-001') {
        setReports((items) => upsertById(items, report));
      }
    };
    const onReportResolved = (report: PoliceReport) => {
      if (report.personnel_id === 'pcpl-001') {
        setReports((items) => upsertById(items, report));
      }
    };
    const onDeploymentsBootstrap = (payload: DeploymentAssignment[]) => {
      setDeployments(payload.filter((assignment) => assignment.personnelId === 'pcpl-001'));
    };
    const onDeploymentsUpdated = (payload: DeploymentAssignment[]) => {
      setDeployments(payload.filter((assignment) => assignment.personnelId === 'pcpl-001'));
    };

    operationsSocket.on('connect', onConnect);
    operationsSocket.on('disconnect', onDisconnect);
    operationsSocket.on('personnel:bootstrap', onPersonnelBootstrap);
    operationsSocket.on('personnel:update', onPersonnelUpdate);
    operationsSocket.on('tasks:bootstrap', onTasksBootstrap);
    operationsSocket.on('task:created', onTaskCreated);
    operationsSocket.on('task:updated', onTaskUpdated);
    operationsSocket.on('report:submitted', onReportSubmitted);
    operationsSocket.on('report:resolved', onReportResolved);
    operationsSocket.on('deployments:bootstrap', onDeploymentsBootstrap);
    operationsSocket.on('deployments:updated', onDeploymentsUpdated);
    setIsConnected(operationsSocket.connected);
    if (!operationsSocket.connected) operationsSocket.connect();

    return () => {
      operationsSocket.off('connect', onConnect);
      operationsSocket.off('disconnect', onDisconnect);
      operationsSocket.off('personnel:bootstrap', onPersonnelBootstrap);
      operationsSocket.off('personnel:update', onPersonnelUpdate);
      operationsSocket.off('tasks:bootstrap', onTasksBootstrap);
      operationsSocket.off('task:created', onTaskCreated);
      operationsSocket.off('task:updated', onTaskUpdated);
      operationsSocket.off('report:submitted', onReportSubmitted);
      operationsSocket.off('report:resolved', onReportResolved);
      operationsSocket.off('deployments:bootstrap', onDeploymentsBootstrap);
      operationsSocket.off('deployments:updated', onDeploymentsUpdated);
    };
  }, []);

  const acceptTask = useCallback(async (taskId: string) => {
    const response = await acceptOperationalTask(taskId);
    setTasks((items) => upsertById(items, response.task));
  }, []);

  const createBackupRequest = useCallback(async () => {
    const response = await requestBackup(deployments[0]);
    setTasks((items) => upsertById(items, response.task));
  }, [deployments]);

  const submitReport = useCallback(async (input: SubmitReportInput) => {
    const response = await submitPoliceReport(input, deployments[0]);
    setReports((items) => upsertById(items, response.report));
  }, [deployments]);

  const resolveReport = useCallback(async (reportId: string, resolutionNotes: string) => {
    const response = await resolveIncidentReport(reportId, resolutionNotes);
    setReports((items) => upsertById(items, response.report));
  }, []);

  const value = useMemo(() => ({
    tasks,
    reports,
    deployments,
    personnel,
    isConnected,
    isLoading,
    acceptTask,
    createBackupRequest,
    submitReport,
    resolveReport,
  }), [
    acceptTask,
    createBackupRequest,
    deployments,
    isConnected,
    isLoading,
    personnel,
    reports,
    resolveReport,
    submitReport,
    tasks,
  ]);

  return <OperationalContext.Provider value={value}>{children}</OperationalContext.Provider>;
}

export const useOperationalContext = () => {
  const context = useContext(OperationalContext);
  if (!context) {
    throw new Error('useOperationalContext must be used inside OperationalProvider.');
  }
  return context;
};
