import { API_URL } from './apiConfig';
import { requestJson } from './requestJson';

export type IncidentLocationResult = {
  latitude: number;
  longitude: number;
  location: string;
  barangay: string;
};

export async function resolveIncidentLocation(
  coordinates: { latitude: number; longitude: number }, token?: string | null,
): Promise<IncidentLocationResult> {
  const { response, payload } = await requestJson(
    `${API_URL}/api/barangays/resolve-location?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    10_000,
  );
  if (!response.ok) throw new Error('Incident location lookup unavailable.');
  return payload;
}
