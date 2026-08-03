import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import {
  acceptOperationalTask,
  acknowledgeDeploymentAssignment,
  cancelOperationalTask,
  fetchOperations,
  fetchLivePersonnel,
  fetchReportPage,
  fetchTaskHistoryPage,
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
  isReportsLoading: boolean;
  isReportsLoadingMore: boolean;
  reportsHasMore: boolean;
  isTaskHistoryLoading: boolean;
  isTaskHistoryLoadingMore: boolean;
  taskHistoryHasMore: boolean;
  currentOfficer: LivePersonnel;
  currentPersonnelId: string;
  acceptTask: (taskId: string) => Promise<void>;
  cancelBackupRequest: (taskId: string) => Promise<void>;
  createBackupRequest: () => Promise<void>;
  submitReport: (input: SubmitReportInput) => Promise<void>;
  resolveReport: (reportId: string, resolutionNotes: string) => Promise<void>;
  acknowledgeDeployment: (assignmentId: string) => Promise<void>;
  refreshReports: (category: 'all' | 'incident' | 'routine') => Promise<void>;
  loadMoreReports: () => Promise<void>;
  refreshTaskHistory: () => Promise<void>;
  loadMoreTaskHistory: () => Promise<void>;
};

const OperationalContext = createContext<OperationalContextValue | null>(null);

const upsertById = <T extends { id: string }>(items: T[], incoming: T) => {
  const exists = items.some((item) => item.id === incoming.id);
  return exists
    ? items.map((item) => (item.id === incoming.id ? incoming : item))
    : [incoming, ...items];
};

const mergeById = <T extends { id: string }>(first: T[], second: T[]) => {
  const merged = new Map<string, T>();
  [...first, ...second].forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
};

const isActiveTask = (task: OperationalTask) => (
  task.status === 'open' || task.status === 'full'
);

export function OperationalProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const currentPersonnelId = user?.personnelId || '';
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [reports, setReports] = useState<PoliceReport[]>([]);
  const [deployments, setDeployments] = useState<DeploymentAssignment[]>([]);
  const [personnel, setPersonnel] = useState<LivePersonnel[]>([]);
  const [isConnected, setIsConnected] = useState(operationsSocket.connected);
  const [isLoading, setIsLoading] = useState(true);
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const [isReportsLoadingMore, setIsReportsLoadingMore] = useState(false);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<'all' | 'incident' | 'routine'>('all');
  const [isTaskHistoryLoading, setIsTaskHistoryLoading] = useState(false);
  const [isTaskHistoryLoadingMore, setIsTaskHistoryLoadingMore] = useState(false);
  const [taskHistoryHasMore, setTaskHistoryHasMore] = useState(false);
  const [taskHistoryCursor, setTaskHistoryCursor] = useState<string | null>(null);
  const reportRequestId = useRef(0);
  const taskHistoryRequestId = useRef(0);

  const currentOfficer = useMemo<LivePersonnel>(() => {
    const liveProfile = personnel.find((member) => member.id === currentPersonnelId);
    if (liveProfile) return liveProfile;

    return {
      id: currentPersonnelId,
      badge: user?.profile?.badgeNumber || currentPersonnelId,
      name: user?.profile?.fullName || 'Police Personnel',
      rank: user?.profile?.rank || 'Police Officer',
      locationName: 'GPS location unavailable',
      latitude: null,
      longitude: null,
      status: user?.profile?.dutyStatus || 'Off Duty',
      photoUrl: user?.profile?.photoUrl || 'https://randomuser.me/api/portraits/men/32.jpg',
      lastUpdated: new Date().toISOString(),
      isVisibleOnMap: false,
      isLocationStale: true,
      locationStatus: 'unavailable',
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
    setReports([]);
    setReportCursor(null);
    setReportsHasMore(false);
    setTaskHistoryCursor(null);
    setTaskHistoryHasMore(false);
    Promise.all([
      fetchOperations(currentPersonnelId, token),
      fetchLivePersonnel(token),
    ])
      .then(([operationsPayload, personnelPayload]) => {
        setTasks((items) => {
          const history = items.filter((task) => !isActiveTask(task));
          return mergeById(operationsPayload.tasks, history);
        });
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
    const onTasksBootstrap = (payload: OperationalTask[]) => setTasks((items) => {
      const history = items.filter((task) => !isActiveTask(task));
      return mergeById(payload, history);
    });
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
      setDeployments(payload.filter((assignment) => (
        assignment.personnelId === currentPersonnelId
        && assignment.isCurrentShift !== false
      )));
    };
    const onDeploymentsUpdated = (payload: DeploymentAssignment[]) => {
      setDeployments(payload.filter((assignment) => (
        assignment.personnelId === currentPersonnelId
        && assignment.isCurrentShift !== false
      )));
    };
    const onDeploymentAcknowledged = (assignment: DeploymentAssignment) => {
      if (assignment.personnelId !== currentPersonnelId) return;
      setDeployments((items) => upsertById(items, assignment));
    };
    const onPersonnelInactivity = (payload: {
      personnelId?: string;
      inactivityMinutes?: number;
    }) => {
      if (payload.personnelId !== currentPersonnelId) return;
      Alert.alert(
        'Movement check required',
        `No movement has been detected for ${payload.inactivityMinutes || 5} minutes. Please confirm your status or move if safe to do so.`,
      );
    };

    operationsSocket.on('connect', onConnect);
    operationsSocket.on('disconnect', onDisconnect);
    operationsSocket.on('personnel:bootstrap', onPersonnelBootstrap);
    operationsSocket.on('personnel:update', onPersonnelUpdate);
    operationsSocket.on('personnel:identity-updated', onPersonnelIdentityUpdated);
    operationsSocket.on('tasks:bootstrap', onTasksBootstrap);
    operationsSocket.on('task:created', onTaskCreated);
    operationsSocket.on('task:updated', onTaskUpdated);
    operationsSocket.on('report:submitted', onReportSubmitted);
    operationsSocket.on('report:resolved', onReportResolved);
    operationsSocket.on('deployments:bootstrap', onDeploymentsBootstrap);
    operationsSocket.on('deployments:updated', onDeploymentsUpdated);
    operationsSocket.on('deployment:acknowledged', onDeploymentAcknowledged);
    operationsSocket.on('personnel:inactivity', onPersonnelInactivity);
    setIsConnected(operationsSocket.connected);
    if (!operationsSocket.connected) operationsSocket.connect();

    return () => {
      operationsSocket.off('connect', onConnect);
      operationsSocket.off('disconnect', onDisconnect);
      operationsSocket.off('personnel:bootstrap', onPersonnelBootstrap);
      operationsSocket.off('personnel:update', onPersonnelUpdate);
      operationsSocket.off('personnel:identity-updated', onPersonnelIdentityUpdated);
      operationsSocket.off('tasks:bootstrap', onTasksBootstrap);
      operationsSocket.off('task:created', onTaskCreated);
      operationsSocket.off('task:updated', onTaskUpdated);
      operationsSocket.off('report:submitted', onReportSubmitted);
      operationsSocket.off('report:resolved', onReportResolved);
      operationsSocket.off('deployments:bootstrap', onDeploymentsBootstrap);
      operationsSocket.off('deployments:updated', onDeploymentsUpdated);
      operationsSocket.off('deployment:acknowledged', onDeploymentAcknowledged);
      operationsSocket.off('personnel:inactivity', onPersonnelInactivity);
      operationsSocket.disconnect();
    };
  }, [currentPersonnelId]);

  const refreshReports = useCallback(async (
    category: 'all' | 'incident' | 'routine',
  ) => {
    if (!currentPersonnelId) return;
    const requestId = ++reportRequestId.current;
    setReportCategory(category);
    setIsReportsLoading(true);
    setReportCursor(null);
    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category,
      }, token);
      if (requestId !== reportRequestId.current) return;
      setReports(payload.data);
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
    } finally {
      if (requestId === reportRequestId.current) setIsReportsLoading(false);
    }
  }, [currentPersonnelId, token]);

  const loadMoreReports = useCallback(async () => {
    if (!currentPersonnelId || !reportCursor || isReportsLoadingMore) return;
    setIsReportsLoadingMore(true);
    try {
      const payload = await fetchReportPage({
        personnelId: currentPersonnelId,
        category: reportCategory,
        cursor: reportCursor,
      }, token);
      setReports((items) => mergeById(items, payload.data));
      setReportCursor(payload.pagination.nextCursor);
      setReportsHasMore(payload.pagination.hasNextPage);
    } finally {
      setIsReportsLoadingMore(false);
    }
  }, [currentPersonnelId, isReportsLoadingMore, reportCategory, reportCursor, token]);

  const refreshTaskHistory = useCallback(async () => {
    if (!currentPersonnelId) return;
    const requestId = ++taskHistoryRequestId.current;
    setIsTaskHistoryLoading(true);
    setTaskHistoryCursor(null);
    try {
      const payload = await fetchTaskHistoryPage({ personnelId: currentPersonnelId }, token);
      if (requestId !== taskHistoryRequestId.current) return;
      setTasks((items) => mergeById(items.filter(isActiveTask), payload.data));
      setTaskHistoryCursor(payload.pagination.nextCursor);
      setTaskHistoryHasMore(payload.pagination.hasNextPage);
    } finally {
      if (requestId === taskHistoryRequestId.current) setIsTaskHistoryLoading(false);
    }
  }, [currentPersonnelId, token]);

  const loadMoreTaskHistory = useCallback(async () => {
    if (!currentPersonnelId || !taskHistoryCursor || isTaskHistoryLoadingMore) return;
    setIsTaskHistoryLoadingMore(true);
    try {
      const payload = await fetchTaskHistoryPage({
        personnelId: currentPersonnelId,
        cursor: taskHistoryCursor,
      }, token);
      setTasks((items) => mergeById(items, payload.data));
      setTaskHistoryCursor(payload.pagination.nextCursor);
      setTaskHistoryHasMore(payload.pagination.hasNextPage);
    } finally {
      setIsTaskHistoryLoadingMore(false);
    }
  }, [currentPersonnelId, isTaskHistoryLoadingMore, taskHistoryCursor, token]);

  const acceptTask = useCallback(async (taskId: string) => {
    const response = await acceptOperationalTask(taskId, actor, token);
    setTasks((items) => upsertById(items, response.task));
  }, [actor, token]);

  const cancelBackupRequest = useCallback(async (taskId: string) => {
    const response = await cancelOperationalTask(taskId, token);
    setTasks((items) => upsertById(items, response.task));
  }, [token]);

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

  const acknowledgeDeployment = useCallback(async (assignmentId: string) => {
    const response = await acknowledgeDeploymentAssignment(assignmentId, token);
    setDeployments((items) => upsertById(items, response.deployment));
  }, [token]);

  const value = useMemo(() => ({
    tasks,
    reports,
    deployments,
    personnel,
    isConnected,
    isLoading,
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    currentOfficer,
    currentPersonnelId,
    acceptTask,
    cancelBackupRequest,
    createBackupRequest,
    submitReport,
    resolveReport,
    acknowledgeDeployment,
    refreshReports,
    loadMoreReports,
    refreshTaskHistory,
    loadMoreTaskHistory,
  }), [
    acceptTask,
    cancelBackupRequest,
    createBackupRequest,
    currentOfficer,
    currentPersonnelId,
    deployments,
    isConnected,
    isLoading,
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    personnel,
    reports,
    resolveReport,
    acknowledgeDeployment,
    refreshReports,
    loadMoreReports,
    refreshTaskHistory,
    loadMoreTaskHistory,
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
