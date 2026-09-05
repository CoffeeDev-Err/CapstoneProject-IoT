import { API_URL } from './apiConfig';
import { requestJson } from './requestJson';
import type { OfficerNotification } from '../types/notifications';
import type { CursorPagination } from './operationsApi';

const request = async <T>(path: string, token: string, options: RequestInit = {}): Promise<T> => {
  const { response, payload } = await requestJson(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(payload.message || 'Notification request failed.');
  return payload as T;
};

export const fetchMyNotifications = (
  token: string,
  { cursor, limit = 10 }: { cursor?: string | null; limit?: number } = {},
) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return request<{
  notifications: OfficerNotification[];
  pagination: CursorPagination;
  unreadCount: number;
  }>(`/api/notifications/me?${params.toString()}`, token);
};

export const markMyNotificationRead = (notificationId: string, token: string) => request<{
  notification: OfficerNotification;
}>(`/api/notifications/me/${encodeURIComponent(notificationId)}/read`, token, { method: 'PATCH' });

export const markAllMyNotificationsRead = (token: string) => request<{ updated: number }>(
  '/api/notifications/me/read-all',
  token,
  { method: 'PATCH' },
);

export const registerNotificationDevice = ({
  expoPushToken,
  platform,
  deviceName,
  token,
}: {
  expoPushToken: string;
  platform: 'android' | 'ios';
  deviceName?: string | null;
  token: string;
}) => request<{ success: true }>('/api/notifications/devices', token, {
  method: 'POST',
  body: JSON.stringify({
    expo_push_token: expoPushToken,
    platform,
    device_name: deviceName,
  }),
});

export const unregisterNotificationDevice = (expoPushToken: string, token: string) => request<{
  success: true;
}>('/api/notifications/devices', token, {
  method: 'DELETE',
  body: JSON.stringify({ expo_push_token: expoPushToken }),
});
