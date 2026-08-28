import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import {
  fetchOperations,
  operationsSocket,
  resolveApiAssetUrl,
} from '../../services/operationsApi';
import type {
  DeploymentAssignment,
  LivePersonnel,
  OperationalTask,
  PoliceReport,
} from '../../types/operations';
import { isActiveTask, mergeById, upsertById } from './operationalState';

type IdentityUpdate = {
  personnelId?: string; name?: string; badgeNumber?: string; rank?: string;
  mobileNumber?: string; photoUrl?: string; loginId?: string; officialEmail?: string;
  emailVerified?: boolean; accountStatus?: string;
};

type OperationalSocketOptions = {
  applyIdentityUpdate: (payload: IdentityUpdate) => void;
  clearSession: () => Promise<unknown>;
  currentPersonnelId: string;
  setDeployments: Dispatch<SetStateAction<DeploymentAssignment[]>>;
  setPersonnel: Dispatch<SetStateAction<LivePersonnel[]>>;
  setReports: Dispatch<SetStateAction<PoliceReport[]>>;
  setTasks: Dispatch<SetStateAction<OperationalTask[]>>;
  setUpcomingDeployment: Dispatch<SetStateAction<DeploymentAssignment | null>>;
  token?: string | null;
};

const resolvePersonnelPhoto = (member: LivePersonnel): LivePersonnel => ({
  ...member,
  photoUrl: resolveApiAssetUrl(member.photoUrl),
});

export function useOperationalSocket({
  applyIdentityUpdate,
  clearSession,
  currentPersonnelId,
  setDeployments,
  setPersonnel,
  setReports,
  setTasks,
  setUpcomingDeployment,
  token,
}: OperationalSocketOptions) {
  const [isConnected, setIsConnected] = useState(operationsSocket.connected);

  useEffect(() => {
    let effectActive = true;
    operationsSocket.auth = token ? { token } : {};
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onPersonnel = (payload: LivePersonnel[]) => setPersonnel(payload.map(resolvePersonnelPhoto));
    const onPersonnelIdentityUpdated = (payload: IdentityUpdate) => {
      if (!payload.personnelId) return;
      if (payload.accountStatus?.toLowerCase() === 'inactive') {
        Alert.alert('Account deactivated', 'Your account was deactivated by a supervisor. Contact your administrator for assistance.');
        clearSession().catch(() => undefined);
        return;
      }
      applyIdentityUpdate(payload);
      setPersonnel((items) => items.map((member) => member.id === payload.personnelId
        ? { ...member, name: payload.name || member.name, rank: payload.rank || member.rank,
          photoUrl: payload.photoUrl ? resolveApiAssetUrl(payload.photoUrl) : member.photoUrl }
        : member));
      setReports((items) => items.map((report) => report.personnel_id === payload.personnelId
        ? { ...report, officer: payload.name || report.officer } : report));
      setDeployments((items) => items.map((assignment) => assignment.personnelId === payload.personnelId
        ? { ...assignment, personnelName: payload.name || assignment.personnelName,
          rank: payload.rank || assignment.rank } : assignment));
    };
    const onTasksBootstrap = (payload: OperationalTask[]) => setTasks((items) => {
      const history = items.filter((task) => !isActiveTask(task));
      return mergeById(payload, history);
    });
    const onTaskUpdate = (task: OperationalTask) => setTasks((items) => upsertById(items, task));
    const onTaskRemoved = (payload: { id?: string }) => {
      if (payload.id) setTasks((items) => items.filter((task) => task.id !== payload.id));
    };
    const onReportUpdate = (report: PoliceReport) => {
      if (report.personnel_id === currentPersonnelId) setReports((items) => upsertById(items, report));
    };
    const onReportSubmitted = onReportUpdate;
    const onReportResolved = onReportUpdate;
    const onReportUpdated = onReportUpdate;
    const refreshAuthorizedOperations = () => {
      fetchOperations(currentPersonnelId, token)
        .then((operationsPayload) => {
          if (!effectActive) return;
          setUpcomingDeployment(operationsPayload.upcomingDeployment);
          setTasks((items) => mergeById(
            operationsPayload.tasks,
            items.filter((task) => !isActiveTask(task)),
          ));
        })
        .catch(() => undefined);
    };
    const onDeploymentsBootstrap = (payload: DeploymentAssignment[]) => {
      setDeployments(payload.filter((assignment) => assignment.personnelId === currentPersonnelId
        && assignment.isCurrentShift !== false));
      refreshAuthorizedOperations();
    };
    const onDeploymentsUpdated = onDeploymentsBootstrap;
    const onDeploymentAcknowledged = (assignment: DeploymentAssignment) => {
      if (assignment.personnelId === currentPersonnelId) {
        setDeployments((items) => upsertById(items, assignment));
      }
    };
    const onPersonnelInactivity = (payload: { personnelId?: string; inactivityMinutes?: number }) => {
      if (payload.personnelId !== currentPersonnelId) return;
      Alert.alert('Movement check required',
        `No movement has been detected for ${payload.inactivityMinutes || 5} minutes. Please confirm your status or move if safe to do so.`);
    };

    operationsSocket.on('connect', onConnect);
    operationsSocket.on('disconnect', onDisconnect);
    operationsSocket.on('personnel:bootstrap', onPersonnel);
    operationsSocket.on('personnel:update', onPersonnel);
    operationsSocket.on('personnel:identity-updated', onPersonnelIdentityUpdated);
    operationsSocket.on('tasks:bootstrap', onTasksBootstrap);
    operationsSocket.on('task:created', onTaskUpdate);
    operationsSocket.on('task:updated', onTaskUpdate);
    operationsSocket.on('task:removed', onTaskRemoved);
    operationsSocket.on('report:submitted', onReportSubmitted);
    operationsSocket.on('report:resolved', onReportResolved);
    operationsSocket.on('report:updated', onReportUpdated);
    operationsSocket.on('deployments:bootstrap', onDeploymentsBootstrap);
    operationsSocket.on('deployments:updated', onDeploymentsUpdated);
    operationsSocket.on('deployment:acknowledged', onDeploymentAcknowledged);
    operationsSocket.on('personnel:inactivity', onPersonnelInactivity);
    setIsConnected(operationsSocket.connected);
    if (!operationsSocket.connected) operationsSocket.connect();

    return () => {
      effectActive = false;
      operationsSocket.off('connect', onConnect);
      operationsSocket.off('disconnect', onDisconnect);
      operationsSocket.off('personnel:bootstrap', onPersonnel);
      operationsSocket.off('personnel:update', onPersonnel);
      operationsSocket.off('personnel:identity-updated', onPersonnelIdentityUpdated);
      operationsSocket.off('tasks:bootstrap', onTasksBootstrap);
      operationsSocket.off('task:created', onTaskUpdate);
      operationsSocket.off('task:updated', onTaskUpdate);
      operationsSocket.off('task:removed', onTaskRemoved);
      operationsSocket.off('report:submitted', onReportSubmitted);
      operationsSocket.off('report:resolved', onReportResolved);
      operationsSocket.off('report:updated', onReportUpdated);
      operationsSocket.off('deployments:bootstrap', onDeploymentsBootstrap);
      operationsSocket.off('deployments:updated', onDeploymentsUpdated);
      operationsSocket.off('deployment:acknowledged', onDeploymentAcknowledged);
      operationsSocket.off('personnel:inactivity', onPersonnelInactivity);
      operationsSocket.disconnect();
    };
  }, [applyIdentityUpdate, clearSession, currentPersonnelId, setDeployments, setPersonnel,
    setReports, setTasks, setUpcomingDeployment, token]);

  return isConnected;
}
