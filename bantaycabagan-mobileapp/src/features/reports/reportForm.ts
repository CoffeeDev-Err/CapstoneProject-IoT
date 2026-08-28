import { CABAGAN_BARANGAYS, findCabaganBarangay } from '../../constants/cabaganBarangays';
import type { SubmitReportInput } from '../../types/operations';

export const REPORT_TYPES = ['incident', 'patrol', 'checkpoint', 'others'] as const;
export const REPORT_FILTERS = ['all', 'incident', 'routine'] as const;

export type ReportForm = SubmitReportInput & {
  occurred_at: string;
  assigned_area: string;
  location_source: 'gps' | 'manual';
};

export const createEmptyReportForm = (): ReportForm => ({
  report_type: 'incident',
  title: '',
  description: '',
  location: '',
  barangay: '',
  severity: 2,
  occurred_at: '',
  assigned_area: '',
  location_source: 'manual',
  latitude: undefined,
  longitude: undefined,
});

export const getBarangayFromArea = (area?: string) => {
  const value = (area || '').trim();
  if (!value) return '';
  const exactMatch = findCabaganBarangay(value);
  if (exactMatch) return exactMatch;
  const normalized = value
    .replace(/^barangay\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return CABAGAN_BARANGAYS.find((barangay) => {
    const candidate = barangay.toLowerCase();
    return normalized === candidate
      || normalized.startsWith(`${candidate},`)
      || normalized.startsWith(`${candidate} `);
  }) || '';
};
