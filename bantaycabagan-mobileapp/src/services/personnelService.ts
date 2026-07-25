import { Personnel } from '../types/personnel';
import { API_URL } from './apiConfig';

type ApiPersonnel = {
  id: string;
  name: string;
  rank: string;
  mobileNumber?: string;
  status: string;
  lastUpdated: string;
  locationName: string;
};

export const fetchPersonnel = async (): Promise<Personnel[]> => {
  const response = await fetch(`${API_URL}/api/personnel?limit=100`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Failed to load personnel.');
  }

  return (payload.data as ApiPersonnel[]).map((member) => {
    const normalizedStatus = member.status.trim().toLowerCase();
    const status = normalizedStatus === 'off duty'
      ? 'OFF_DUTY'
      : ['on patrol', 'responding', 'on duty', 'in field'].includes(normalizedStatus)
        ? 'IN_FIELD'
        : 'AT_BASE';

    return {
      id: member.id,
      name: member.name,
      unit: member.rank,
      contact: member.mobileNumber || 'Not provided',
      status,
      lastSeen: member.lastUpdated,
      location: member.locationName,
    };
  });
};
