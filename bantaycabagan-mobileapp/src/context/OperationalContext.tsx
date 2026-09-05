import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  acceptOperationalTask,
  acknowledgeDeploymentAssignment,
  cancelOperationalTask,
  fetchOperations,
  fetchLivePersonnel,
  requestBackup,
  resolveApiAssetUrl,
  resolveIncidentReport,
} from '../services/operationsApi';
import type {
  DeploymentAssignment,
  LivePersonnel,
  OperationalTask,
  PoliceReport,
  SubmitReportInput,
} from '../types/operations';
import { isActiveTask, mergeById, upsertById } from '../features/operations/operationalState';
import { useOperationalSocket } from '../features/operations/useOperationalSocket';
import { useOfflineReportSync } from '../features/reports/useOfflineReportSync';
import { useReportPagination } from '../features/reports/useReportPagination';
import type { ReportDateRange } from '../features/reports/useReportPagination';
import { useTaskHistoryPagination } from '../features/tasks/useTaskHistoryPagination';

type OperationalContextValue = {
  tasks: OperationalTask[];
  reports: PoliceReport[];
  deployments: DeploymentAssignment[];
  upcomingDeployment: DeploymentAssignment | null;
  personnel: LivePersonnel[];
  isConnected: boolean;
  isLoading: boolean;
  initialDataError: string;
  refreshOperations: () => Promise<void>;
  isReportsLoading: boolean;
  isReportsLoadingMore: boolean;
  reportsHasMore: boolean;
  reportsError: string;
  isTaskHistoryLoading: boolean;
  isTaskHistoryLoadingMore: boolean;
  taskHistoryHasMore: boolean;
  currentOfficer: LivePersonnel;
  currentPersonnelId: string;
  acceptTask: (taskId: string) => Promise<void>;
  cancelBackupRequest: (taskId: string) => Promise<void>;
  createBackupRequest: () => Promise<void>;
  submitReport: (input: SubmitReportInput) => Promise<'submitted' | 'queued'>;
  resolveReport: (reportId: string, resolutionNotes: string) => Promise<void>;
  acknowledgeDeployment: (assignmentId: string) => Promise<void>;
  refreshReports: (
    category: 'all' | 'incident' | 'routine',
    dateRange?: ReportDateRange,
  ) => Promise<void>;
  loadMoreReports: () => Promise<void>;
  refreshTaskHistory: () => Promise<void>;
  loadMoreTaskHistory: () => Promise<void>;
};

const OperationalContext = createContext<OperationalContextValue | null>(null);

const resolvePersonnelPhoto = (member: LivePersonnel): LivePersonnel => ({
  ...member,
  photoUrl: resolveApiAssetUrl(member.photoUrl),
});

export function OperationalProvider({ children }: { children: React.ReactNode }) {
  const { applyIdentityUpdate, clearSession, token, user } = useAuth();
  const currentPersonnelId = user?.personnelId || '';
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [reports, setReports] = useState<PoliceReport[]>([]);
  const [deployments, setDeployments] = useState<DeploymentAssignment[]>([]);
  const [upcomingDeployment, setUpcomingDeployment] = useState<DeploymentAssignment | null>(null);
  const [personnel, setPersonnel] = useState<LivePersonnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialDataError, setInitialDataError] = useState('');
  const bootstrapRequest = useRef(0);

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
      photoUrl: resolveApiAssetUrl(user?.profile?.photoUrl)
        || 'https://randomuser.me/api/portraits/men/32.jpg',
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

  const isConnected = useOperationalSocket({
    applyIdentityUpdate,
    clearSession,
    currentPersonnelId,
    setDeployments,
    setPersonnel,
    setReports,
    setTasks,
    setUpcomingDeployment,
    token,
  });
  const { submitReport } = useOfflineReportSync({
    actor,
    currentPersonnelId,
    deployments,
    isConnected,
    setReports,
    token,
  });
  const {
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
    refreshReports,
    loadMoreReports,
    resetReportPagination,
  } = useReportPagination({ currentPersonnelId, setReports, token });
  const {
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    refreshTaskHistory,
    loadMoreTaskHistory,
    resetTaskHistoryPagination,
  } = useTaskHistoryPagination({ currentPersonnelId, setTasks, token });

  const refreshOperations = useCallback(async () => {
    if (!currentPersonnelId || !token) return;
    const request = ++bootstrapRequest.current;
    setIsLoading(true);
    setInitialDataError('');
    const [operations, locations] = await Promise.allSettled([
      fetchOperations(currentPersonnelId, token),
      fetchLivePersonnel(token),
    ]);
    if (request !== bootstrapRequest.current) return;
    const unavailable: string[] = [];
    if (operations.status === 'fulfilled' && Array.isArray(operations.value?.tasks)
      && Array.isArray(operations.value?.deployments)) {
      const operationsPayload = operations.value;
      setTasks((items) => {
        const history = items.filter((task) => !isActiveTask(task));
        return mergeById(operationsPayload.tasks, history);
      });
      setDeployments(operationsPayload.deployments);
      setUpcomingDeployment(operationsPayload.upcomingDeployment);
    } else unavailable.push('tasks and deployments');
    if (locations.status === 'fulfilled' && Array.isArray(locations.value?.data)) {
      setPersonnel(locations.value.data.map(resolvePersonnelPhoto));
    } else unavailable.push('personnel locations');
    setInitialDataError(unavailable.length
      ? `Could not refresh ${unavailable.join(' and ')}. Previously loaded data may be outdated. Check your connection and retry.` : '');
    setIsLoading(false);
  }, [currentPersonnelId, token]);

  useEffect(() => {
    setReports([]);
    setTasks([]);
    setDeployments([]);
    setPersonnel([]);
    setUpcomingDeployment(null);
    resetReportPagination();
    resetTaskHistoryPagination();
    if (currentPersonnelId && token) {
      refreshReports('all').catch(() => undefined); // Report pagination exposes its own error/retry UI.
      void refreshOperations();
    } else setIsLoading(false);
    return () => { bootstrapRequest.current += 1; };
  }, [currentPersonnelId, refreshOperations, refreshReports, resetReportPagination, resetTaskHistoryPagination, token]);

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
    upcomingDeployment,
    personnel,
    isConnected,
    isLoading,
    initialDataError,
    refreshOperations,
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
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
    upcomingDeployment,
    isConnected,
    isLoading,
    initialDataError,
    refreshOperations,
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
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
