import geography from './data/cabagan-geography.json';

export type PatrolCenter = {
  latitude: number;
  longitude: number;
};

// Validated interior label points; navigation may still choose a road access point.
export const CABAGAN_BARANGAY_CENTERS: Record<string, PatrolCenter> = Object.fromEntries(
  geography.barangays.features.map(feature => [feature.properties.code, feature.properties.center]),
);

export const DEFAULT_CABAGAN_PATROL_CENTER: PatrolCenter = {
  latitude: 17.4239,
  longitude: 121.7681,
};

export const SPECIAL_PATROL_CENTERS: Record<string, PatrolCenter> = {
  'cabagan-public-market-zone': { latitude: 17.4272, longitude: 121.7658 },
  'municipal-hall-perimeter': { latitude: 17.4239, longitude: 121.7681 },
  'barangay-centro-route': { latitude: 17.4248, longitude: 121.7669 },
};

export const normalizePatrolAreaCode = (value?: string) => String(value || '')
  .trim()
  .replace(/^barangay\s+/i, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

