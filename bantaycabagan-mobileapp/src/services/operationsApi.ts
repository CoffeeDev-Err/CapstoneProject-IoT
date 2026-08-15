import { io } from 'socket.io-client';
import { File } from 'expo-file-system';
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
  transports: ['polling', 'websocket'],
  autoConnect: false,
});

const request = async <T>(
  path: string,
  options?: RequestInit,
  token?: string | null,
): Promise<T> => {
  const isMultipart = options?.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(!isMultipart ? { 'Content-Type': 'application/json' } : {}),
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

export type CursorPagination = {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
};

export type CursorPage<T> = {
  data: T[];
  pagination: CursorPagination;
};

export const resolveApiAssetUrl = (assetUrl?: string) => {
  if (!assetUrl) return '';
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl;
  return `${API_URL}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`;
};

export const fetchOperations = (personnelId: string, token?: string | null) => request<{
  tasks: OperationalTask[];
  reports: PoliceReport[];
  deployments: DeploymentAssignment[];
  upcomingDeployment: DeploymentAssignment | null;
}>(`/api/operations/bootstrap?personnel_id=${encodeURIComponent(personnelId)}`, undefined, token);

export const fetchLivePersonnel = (token?: string | null) => request<{
  data: LivePersonnel[];
}>('/api/personnel?limit=100', undefined, token);

export const fetchReportPage = ({
  personnelId,
  category = 'all',
  cursor,
  limit = 10,
}: {
  personnelId: string;
  category?: 'all' | 'incident' | 'routine';
  cursor?: string | null;
  limit?: number;
}, token?: string | null) => {
  const params = new URLSearchParams({
    pagination: 'cursor',
    limit: String(limit),
    personnel_id: personnelId,
  });
  if (category !== 'all') params.set('category', category);
  if (cursor) params.set('cursor', cursor);
  return request<CursorPage<PoliceReport>>(`/api/reports?${params.toString()}`, undefined, token);
};

export const fetchTaskHistoryPage = ({
  personnelId,
  cursor,
  limit = 10,
}: {
  personnelId: string;
  cursor?: string | null;
  limit?: number;
}, token?: string | null) => {
  const params = new URLSearchParams({
    pagination: 'cursor',
    view: 'history',
    limit: String(limit),
    personnel_id: personnelId,
  });
  if (cursor) params.set('cursor', cursor);
  return request<CursorPage<OperationalTask>>(`/api/tasks?${params.toString()}`, undefined, token);
};

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

export const cancelOperationalTask = (
  taskId: string,
  token?: string | null,
) => request<{ task: OperationalTask }>(
  `/api/tasks/${taskId}/cancel`,
  { method: 'PATCH' },
  token,
);

export const acknowledgeDeploymentAssignment = (
  assignmentId: string,
  token?: string | null,
) => request<{ deployment: DeploymentAssignment }>(
  `/api/deployments/${encodeURIComponent(assignmentId)}/acknowledge`,
  { method: 'PATCH' },
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
) => {
  const payload = {
    ...input,
    personnel_id: actor.id,
    officer: actor.name,
    assigned_area: input.assigned_area || deployment?.patrolArea || actor.station,
    occurred_at: input.occurred_at,
    latitude: input.latitude,
    longitude: input.longitude,
  };

  if (!input.evidence_photo) {
    return request<{ report: PoliceReport }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  }

  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'evidence_photo' || value === undefined || value === null) return;
    formData.append(key, String(value));
  });
  formData.append('evidence_camera_facing', input.evidence_photo.camera_facing);
  formData.append('evidence_captured_at', input.evidence_photo.captured_at);
  const evidenceFile = new File(input.evidence_photo.uri);
  formData.append('evidence_photo', evidenceFile, input.evidence_photo.name);

  return request<{ report: PoliceReport }>('/api/reports', {
    method: 'POST',
    body: formData,
  }, token);
};

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
