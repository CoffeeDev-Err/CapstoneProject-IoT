import { io } from 'socket.io-client';
import type {
  DeploymentAssignment,
  LivePersonnel,
  OperationalTask,
  PoliceReport,
  SubmitReportInput,
} from '../types/operations';
import { API_URL } from './apiConfig';

export { API_URL } from './apiConfig';

export type OfficerActor = {
  id: string;
  name: string;
  station: string;
};

export const operationsSocket = io(API_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
});

const request = async <T>(
  path: string,
  options?: RequestInit,
  token?: string | null,
): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.message || 'Unable to complete the request.');
  }

  return body;
};

export const fetchOperations = (personnelId: string, token?: string | null) => request<{
  tasks: OperationalTask[];
  reports: PoliceReport[];
  deployments: DeploymentAssignment[];
}>(`/api/operations/bootstrap?personnel_id=${encodeURIComponent(personnelId)}`, undefined, token);

export const fetchLivePersonnel = (token?: string | null) => request<{
  data: LivePersonnel[];
}>('/api/personnel?limit=100', undefined, token);

export const acceptOperationalTask = (
  taskId: string,
  actor: OfficerActor,
  token?: string | null,
) => request<{ task: OperationalTask }>(
  `/api/tasks/${taskId}/accept`,
  {
    method: 'POST',
    body: JSON.stringify({ personnel_id: actor.id }),
  },
  token,
);

export const requestBackup = (
  actor: OfficerActor,
  deployment?: DeploymentAssignment,
  token?: string | null,
) => request<{ task: OperationalTask }>(
  '/api/tasks',
  {
    method: 'POST',
    body: JSON.stringify({
      type: 'backup',
      title: `Backup requested by ${actor.name}`,
      description: 'Additional personnel assistance requested from the assigned area.',
      requested_by: actor.id,
      requester_name: actor.name,
      required_responders: 3,
      location: deployment?.patrolArea || actor.station,
      latitude: deployment?.latitude,
      longitude: deployment?.longitude,
    }),
  },
  token,
);

export const submitPoliceReport = (
  input: SubmitReportInput,
  actor: OfficerActor,
  deployment?: DeploymentAssignment,
  token?: string | null,
) => request<{ report: PoliceReport }>('/api/reports', {
  method: 'POST',
  body: JSON.stringify({
    ...input,
    personnel_id: actor.id,
    officer: actor.name,
    assigned_area: input.assigned_area || deployment?.patrolArea || actor.station,
    occurred_at: input.occurred_at,
    latitude: input.latitude,
    longitude: input.longitude,
  }),
}, token);

export const resolveIncidentReport = (
  reportId: string,
  resolutionNotes: string,
  actor: OfficerActor,
  token?: string | null,
) => (
  request<{ report: PoliceReport }>(`/api/reports/${reportId}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({
      resolved_by: actor.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes,
    }),
  }, token)
);
