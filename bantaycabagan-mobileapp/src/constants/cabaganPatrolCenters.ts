export type PatrolCenter = {
  latitude: number;
  longitude: number;
};

// Barangay reference centers used when an area patrol intentionally has no
// exact post. Coordinates are kept local so View on Map remains dependable
// even when a geocoding service is unavailable.
export const CABAGAN_BARANGAY_CENTERS: Record<string, PatrolCenter> = {
  AGGUB: { latitude: 17.4127, longitude: 121.7341 },
  ANAO: { latitude: 17.4246, longitude: 121.7689 },
  ANGANCASILIAN: { latitude: 17.4245, longitude: 121.8096 },
  BALASIG: { latitude: 17.3735, longitude: 121.8205 },
  CANSAN: { latitude: 17.3936, longitude: 121.8109 },
  'CASIBARAG-NORTE': { latitude: 17.4353, longitude: 121.7534 },
  'CASIBARAG-SUR': { latitude: 17.4326, longitude: 121.7545 },
  CATABAYUNGAN: { latitude: 17.4365, longitude: 121.7578 },
  CUBAG: { latitude: 17.4201, longitude: 121.7887 },
  GARITA: { latitude: 17.4006, longitude: 121.8094 },
  LUQUILU: { latitude: 17.4258, longitude: 121.7601 },
  MABANGUG: { latitude: 17.3641, longitude: 121.9509 },
  MAGASSI: { latitude: 17.3634, longitude: 121.8194 },
  NGARAG: { latitude: 17.4213, longitude: 121.7813 },
  'PILIG-ABAJO': { latitude: 17.3727, longitude: 121.7842 },
  'PILIG-ALTO': { latitude: 17.3695, longitude: 121.8042 },
  CENTRO: { latitude: 17.4264, longitude: 121.7645 },
  'SAN-BERNARDO': { latitude: 17.4028, longitude: 121.7531 },
  'SAN-JUAN': { latitude: 17.4118, longitude: 121.739 },
  SAUI: { latitude: 17.4209, longitude: 121.7262 },
  TALLAG: { latitude: 17.4259, longitude: 121.7225 },
  UGAD: { latitude: 17.4363, longitude: 121.7771 },
  UNION: { latitude: 17.3464, longitude: 122.0015 },
  'MASIPI-EAST': { latitude: 17.3847, longitude: 121.8804 },
  'MASIPI-WEST': { latitude: 17.3805, longitude: 121.8521 },
  'SAN-ANTONIO': { latitude: 17.4027, longitude: 121.6736 },
};

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

