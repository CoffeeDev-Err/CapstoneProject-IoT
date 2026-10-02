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
  completeOperationalTask,
  fetchOperations,
  fetchLivePersonnel,
  requestBackup,
  resolveApiAssetUrl,
  resolveIncidentReport,
  editPoliceReport,
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
import type { ReportDateRange, ReportRefreshOptions } from '../features/reports/useReportPagination';
import { useTaskHistoryPagination } from '../features/tasks/useTaskHistoryPagination';
import {
  loadCachedOperations,
  loadCachedReports,
  loadCachedTasks,
  saveCachedOperations,
  saveCachedReports,
  saveCachedTasks,
} from '../services/offlineOperationsCache';

type OperationalContextValue = {
  tasks: OperationalTask[];
  reports: PoliceReport[];
  deployments: DeploymentAssignment[];
  upcomingDeployment: DeploymentAssignment | null;
  personnel: LivePersonnel[];
  isConnected: boolean;
  isLoading: boolean;
  initialDataError: string;
  isOperationsOffline: boolean;
  refreshOperations: () => Promise<void>;
  isReportsLoading: boolean;
  isReportsLoadingMore: boolean;
  reportsHasMore: boolean;
  reportsError: string;
  isReportsOffline: boolean;
  isTaskHistoryLoading: boolean;
  isTaskHistoryLoadingMore: boolean;
  taskHistoryHasMore: boolean;
  isTaskHistoryOffline: boolean;
  currentOfficer: LivePersonnel;
  currentPersonnelId: string;
  acceptTask: (taskId: string) => Promise<void>;
  cancelBackupRequest: (taskId: string) => Promise<void>;
  completeBackupRequest: (taskId: string) => Promise<OperationalTask>;
  createBackupRequest: () => Promise<void>;
  submitReport: (input: SubmitReportInput) => Promise<'submitted' | 'queued'>;
  resolveReport: (reportId: string, resolutionNotes: string) => Promise<void>;
  editReport: (reportId: string, input: Parameters<typeof editPoliceReport>[1]) => Promise<PoliceReport>;
  acknowledgeDeployment: (assignmentId: string) => Promise<DeploymentAssignment>;
  refreshReports: (
    category: 'all' | 'incident' | 'routine',
    dateRange?: ReportDateRange,
    options?: ReportRefreshOptions,
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
  const [isOperationsOffline, setIsOperationsOffline] = useState(false);
  const bootstrapRequest = useRef(0);
  const cacheOwner = useRef('');

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

  useEffect(() => {
    if (!isConnected || isOperationsOffline || personnel.length === 0) return;
    setInitialDataError((current) => (
      current.includes('personnel locations') ? '' : current
    ));
  }, [initialDataError, isConnected, isOperationsOffline, personnel.length]);

  const { submitReport: submitReportWithOfflineSync } = useOfflineReportSync({
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
    isReportsOffline,
    refreshReports,
    loadMoreReports,
    resetReportPagination,
    invalidateReportViews,
  } = useReportPagination({ currentPersonnelId, setReports, token });
  const {
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    isTaskHistoryOffline,
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
      setIsOperationsOffline(false);
    } else {
      unavailable.push('tasks and deployments');
      setIsOperationsOffline(true);
    }
    if (locations.status === 'fulfilled' && Array.isArray(locations.value?.data)) {
      setPersonnel(locations.value.data.map(resolvePersonnelPhoto));
    } else unavailable.push('personnel locations');
    setInitialDataError(unavailable.length
      ? `Could not refresh ${unavailable.join(' and ')}. Previously loaded data may be outdated. Check your connection and retry.` : '');
    setIsLoading(false);
  }, [currentPersonnelId, token]);

  useEffect(() => {
    let active = true;
    cacheOwner.current = '';
    setIsLoading(true);
    setIsOperationsOffline(false);
    setReports([]);
    setTasks([]);
    setDeployments([]);
    setPersonnel([]);
    setUpcomingDeployment(null);
    resetReportPagination();
    resetTaskHistoryPagination();
    if (currentPersonnelId && token) {
      void (async () => {
        const [cachedOperations, cachedTasks, cachedReports] = await Promise.all([
          loadCachedOperations(currentPersonnelId).catch(() => null),
          loadCachedTasks(currentPersonnelId).catch(() => null),
          loadCachedReports(currentPersonnelId).catch(() => null),
        ]);
        if (!active) return;
        if (cachedOperations) {
          setDeployments(cachedOperations.data.deployments);
          setUpcomingDeployment(cachedOperations.data.upcomingDeployment);
        }
        if (cachedTasks) setTasks(cachedTasks.data);
        if (cachedReports) setReports(cachedReports.data);
        cacheOwner.current = currentPersonnelId;
        await Promise.allSettled([
          refreshReports('all'),
          refreshOperations(),
        ]);
      })();
    } else setIsLoading(false);
    return () => {
      active = false;
      cacheOwner.current = '';
      bootstrapRequest.current += 1;
    };
  }, [currentPersonnelId, refreshOperations, refreshReports, resetReportPagination, resetTaskHistoryPagination, token]);

  useEffect(() => {
    if (cacheOwner.current !== currentPersonnelId) return;
    void saveCachedTasks(currentPersonnelId, tasks).catch(() => undefined);
  }, [currentPersonnelId, tasks]);

  useEffect(() => {
    if (cacheOwner.current !== currentPersonnelId) return;
    void saveCachedReports(currentPersonnelId, reports).catch(() => undefined);
  }, [currentPersonnelId, reports]);

  useEffect(() => {
    if (cacheOwner.current !== currentPersonnelId) return;
    void saveCachedOperations(currentPersonnelId, { deployments, upcomingDeployment }).catch(() => undefined);
  }, [currentPersonnelId, deployments, upcomingDeployment]);

  const acceptTask = useCallback(async (taskId: string) => {
    const response = await acceptOperationalTask(taskId, actor, token);
    setTasks((items) => upsertById(items, response.task));
  }, [actor, token]);

  const cancelBackupRequest = useCallback(async (taskId: string) => {
    const response = await cancelOperationalTask(taskId, token);
    setTasks((items) => upsertById(items, response.task));
  }, [token]);

  const completeBackupRequest = useCallback(async (taskId: string) => {
    const response = await completeOperationalTask(taskId, token);
    setTasks((items) => upsertById(items, response.task));
    return response.task;
  }, [token]);

  const createBackupRequest = useCallback(async () => {
    const response = await requestBackup(actor, deployments[0], token);
    setTasks((items) => upsertById(items, response.task));
  }, [actor, deployments, token]);

  const submitReport = useCallback(async (input: SubmitReportInput) => {
    const result = await submitReportWithOfflineSync(input);
    invalidateReportViews();
    return result;
  }, [invalidateReportViews, submitReportWithOfflineSync]);

  const resolveReport = useCallback(async (reportId: string, resolutionNotes: string) => {
    const response = await resolveIncidentReport(reportId, resolutionNotes, actor, token);
    setReports((items) => upsertById(items, response.report));
    invalidateReportViews();
  }, [actor, invalidateReportViews, token]);

  const editReport = useCallback(async (reportId: string, input: Parameters<typeof editPoliceReport>[1]) => {
    const response = await editPoliceReport(reportId, input, token);
    setReports((items) => upsertById(items, response.report));
    invalidateReportViews();
    return response.report;
  }, [invalidateReportViews, token]);

  const acknowledgeDeployment = useCallback(async (assignmentId: string) => {
    const response = await acknowledgeDeploymentAssignment(assignmentId, token);
    setDeployments((items) => upsertById(items, response.deployment));
    return response.deployment;
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
    isOperationsOffline,
    refreshOperations,
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
    isReportsOffline,
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    isTaskHistoryOffline,
    currentOfficer,
    currentPersonnelId,
    acceptTask,
    cancelBackupRequest,
    completeBackupRequest,
    createBackupRequest,
    submitReport,
    resolveReport,
    editReport,
    acknowledgeDeployment,
    refreshReports,
    loadMoreReports,
    refreshTaskHistory,
    loadMoreTaskHistory,
  }), [
    acceptTask,
    cancelBackupRequest,
    completeBackupRequest,
    createBackupRequest,
    currentOfficer,
    currentPersonnelId,
    deployments,
    upcomingDeployment,
    isConnected,
    isLoading,
    initialDataError,
    isOperationsOffline,
    refreshOperations,
    isReportsLoading,
    isReportsLoadingMore,
    reportsHasMore,
    reportsError,
    isReportsOffline,
    isTaskHistoryLoading,
    isTaskHistoryLoadingMore,
    taskHistoryHasMore,
    isTaskHistoryOffline,
    personnel,
    reports,
    resolveReport,
    editReport,
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
