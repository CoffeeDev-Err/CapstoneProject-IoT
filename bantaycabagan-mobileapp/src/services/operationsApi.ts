import { io } from 'socket.io-client';
import { CURRENT_OFFICER } from '../constants/officer';
import type {
  DeploymentAssignment,
  OperationalTask,
  PoliceReport,
  SubmitReportInput,
} from '../types/operations';
import { API_URL } from './apiConfig';

export { API_URL } from './apiConfig';

export const operationsSocket = io(API_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
});

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.message || 'Unable to complete the request.');
  }

  return body;
};

export const fetchOperations = () => request<{
  tasks: OperationalTask[];
  reports: PoliceReport[];
  deployments: DeploymentAssignment[];
}>(`/api/operations/bootstrap?personnel_id=${CURRENT_OFFICER.id}`);

export const acceptOperationalTask = (taskId: string) => request<{ task: OperationalTask }>(
  `/api/tasks/${taskId}/accept`,
  {
    method: 'POST',
    body: JSON.stringify({ personnel_id: CURRENT_OFFICER.id }),
  },
);

export const requestBackup = (deployment?: DeploymentAssignment) => request<{ task: OperationalTask }>(
  '/api/tasks',
  {
    method: 'POST',
    body: JSON.stringify({
      type: 'backup',
      title: `Backup requested by ${CURRENT_OFFICER.name}`,
      description: 'Additional personnel assistance requested from the assigned area.',
      requested_by: CURRENT_OFFICER.id,
      requester_name: CURRENT_OFFICER.name,
      required_responders: 3,
      location: deployment?.patrolArea || CURRENT_OFFICER.station,
      latitude: deployment?.latitude,
      longitude: deployment?.longitude,
    }),
  },
);

export const submitPoliceReport = (
  input: SubmitReportInput,
  deployment?: DeploymentAssignment,
) => request<{ report: PoliceReport }>('/api/reports', {
  method: 'POST',
  body: JSON.stringify({
    ...input,
    personnel_id: CURRENT_OFFICER.id,
    officer: CURRENT_OFFICER.name,
    assigned_area: input.assigned_area || deployment?.patrolArea || CURRENT_OFFICER.station,
    occurred_at: input.occurred_at,
    latitude: input.latitude ?? deployment?.latitude,
    longitude: input.longitude ?? deployment?.longitude,
  }),
});

export const resolveIncidentReport = (reportId: string, resolutionNotes: string) => (
  request<{ report: PoliceReport }>(`/api/reports/${reportId}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({
      resolved_by: CURRENT_OFFICER.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes,
    }),
  })
);
