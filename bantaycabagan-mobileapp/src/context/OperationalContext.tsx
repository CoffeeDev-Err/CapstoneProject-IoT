import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  acceptOperationalTask,
  fetchOperations,
  fetchLivePersonnel,
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
  currentOfficer: LivePersonnel;
  currentPersonnelId: string;
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
  const { token, user } = useAuth();
  const currentPersonnelId = user?.personnelId || '';
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [reports, setReports] = useState<PoliceReport[]>([]);
  const [deployments, setDeployments] = useState<DeploymentAssignment[]>([]);
  const [personnel, setPersonnel] = useState<LivePersonnel[]>([]);
  const [isConnected, setIsConnected] = useState(operationsSocket.connected);
  const [isLoading, setIsLoading] = useState(true);

  const currentOfficer = useMemo<LivePersonnel>(() => {
    const liveProfile = personnel.find((member) => member.id === currentPersonnelId);
    if (liveProfile) return liveProfile;

    return {
      id: currentPersonnelId,
      badge: user?.profile?.badgeNumber || currentPersonnelId,
      name: user?.profile?.fullName || 'Police Personnel',
      rank: user?.profile?.rank || 'Police Officer',
      locationName: 'Cabagan Police Station',
      latitude: 17.4239,
      longitude: 121.7681,
      status: user?.profile?.dutyStatus || 'Off Duty',
      photoUrl: user?.profile?.photoUrl || 'https://randomuser.me/api/portraits/men/32.jpg',
      lastUpdated: new Date().toISOString(),
    };
  }, [currentPersonnelId, personnel, user]);

  const actor = useMemo(() => ({
    id: currentPersonnelId,
    name: currentOfficer.name,
    station: 'Cabagan Police Station',
  }), [currentOfficer.name, currentPersonnelId]);

  useEffect(() => {
    if (!currentPersonnelId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    Promise.all([
      fetchOperations(currentPersonnelId, token),
      fetchLivePersonnel(token),
    ])
      .then(([operationsPayload, personnelPayload]) => {
        setTasks(operationsPayload.tasks);
        setReports(operationsPayload.reports);
        setDeployments(operationsPayload.deployments);
        setPersonnel(personnelPayload.data);
      })
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, [currentPersonnelId, token]);

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onPersonnelBootstrap = (payload: LivePersonnel[]) => setPersonnel(payload);
    const onPersonnelUpdate = (payload: LivePersonnel[]) => setPersonnel(payload);
    const onPersonnelIdentityUpdated = (payload: {
      personnelId?: string;
      name?: string;
      rank?: string;
    }) => {
      if (!payload.personnelId) return;
      setPersonnel((items) => items.map((member) => (
        member.id === payload.personnelId
          ? {
            ...member,
            name: payload.name || member.name,
            rank: payload.rank || member.rank,
          }
          : member
      )));
      setReports((items) => items.map((report) => (
        report.personnel_id === payload.personnelId
          ? { ...report, officer: payload.name || report.officer }
          : report
      )));
      setDeployments((items) => items.map((assignment) => (
        assignment.personnelId === payload.personnelId
          ? {
            ...assignment,
            personnelName: payload.name || assignment.personnelName,
            rank: payload.rank || assignment.rank,
          }
          : assignment
      )));
    };
    const onTasksBootstrap = (payload: OperationalTask[]) => setTasks(payload);
    const onReportsBootstrap = (payload: PoliceReport[]) => {
      setReports(payload.filter((report) => report.personnel_id === currentPersonnelId));
    };
    const onTaskCreated = (task: OperationalTask) => setTasks((items) => upsertById(items, task));
    const onTaskUpdated = (task: OperationalTask) => setTasks((items) => upsertById(items, task));
    const onReportSubmitted = (report: PoliceReport) => {
      if (report.personnel_id === currentPersonnelId) {
        setReports((items) => upsertById(items, report));
      }
    };
    const onReportResolved = (report: PoliceReport) => {
      if (report.personnel_id === currentPersonnelId) {
        setReports((items) => upsertById(items, report));
      }
    };
    const onDeploymentsBootstrap = (payload: DeploymentAssignment[]) => {
      setDeployments(payload.filter((assignment) => assignment.personnelId === currentPersonnelId));
    };
    const onDeploymentsUpdated = (payload: DeploymentAssignment[]) => {
      setDeployments(payload.filter((assignment) => assignment.personnelId === currentPersonnelId));
    };

    operationsSocket.on('connect', onConnect);
    operationsSocket.on('disconnect', onDisconnect);
    operationsSocket.on('personnel:bootstrap', onPersonnelBootstrap);
    operationsSocket.on('personnel:update', onPersonnelUpdate);
    operationsSocket.on('personnel:identity-updated', onPersonnelIdentityUpdated);
    operationsSocket.on('tasks:bootstrap', onTasksBootstrap);
    operationsSocket.on('reports:bootstrap', onReportsBootstrap);
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
      operationsSocket.off('personnel:identity-updated', onPersonnelIdentityUpdated);
      operationsSocket.off('tasks:bootstrap', onTasksBootstrap);
      operationsSocket.off('reports:bootstrap', onReportsBootstrap);
      operationsSocket.off('task:created', onTaskCreated);
      operationsSocket.off('task:updated', onTaskUpdated);
      operationsSocket.off('report:submitted', onReportSubmitted);
      operationsSocket.off('report:resolved', onReportResolved);
      operationsSocket.off('deployments:bootstrap', onDeploymentsBootstrap);
      operationsSocket.off('deployments:updated', onDeploymentsUpdated);
      operationsSocket.disconnect();
    };
  }, [currentPersonnelId]);

  const acceptTask = useCallback(async (taskId: string) => {
    const response = await acceptOperationalTask(taskId, actor, token);
    setTasks((items) => upsertById(items, response.task));
  }, [actor, token]);

  const createBackupRequest = useCallback(async () => {
    const response = await requestBackup(actor, deployments[0], token);
    setTasks((items) => upsertById(items, response.task));
  }, [actor, deployments, token]);

  const submitReport = useCallback(async (input: SubmitReportInput) => {
    const response = await submitPoliceReport(input, actor, deployments[0], token);
    setReports((items) => upsertById(items, response.report));
  }, [actor, deployments, token]);

  const resolveReport = useCallback(async (reportId: string, resolutionNotes: string) => {
    const response = await resolveIncidentReport(reportId, resolutionNotes, actor, token);
    setReports((items) => upsertById(items, response.report));
  }, [actor, token]);

  const value = useMemo(() => ({
    tasks,
    reports,
    deployments,
    personnel,
    isConnected,
    isLoading,
    currentOfficer,
    currentPersonnelId,
    acceptTask,
    createBackupRequest,
    submitReport,
    resolveReport,
  }), [
    acceptTask,
    createBackupRequest,
    currentOfficer,
    currentPersonnelId,
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
