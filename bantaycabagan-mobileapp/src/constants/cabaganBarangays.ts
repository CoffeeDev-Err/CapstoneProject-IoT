export const CABAGAN_BARANGAYS = [
  'Aggub',
  'Anao',
  'Angancasilian',
  'Balasig',
  'Cansan',
  'Casibarag Norte',
  'Casibarag Sur',
  'Catabayungan',
  'Cubag',
  'Garita',
  'Luquilu',
  'Mabangug',
  'Magassi',
  'Ngarag',
  'Pilig Abajo',
  'Pilig Alto',
  'Centro',
  'San Bernardo',
  'San Juan',
  'Saui',
  'Tallag',
  'Ugad',
  'Union',
  'Masipi East',
  'Masipi West',
  'San Antonio',
] as const;

const normalizeBarangay = (value?: string) => (value || '')
  .trim()
  .replace(/^barangay\s+/i, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

export const findCabaganBarangay = (value?: string) => {
  const normalized = normalizeBarangay(value);
  return CABAGAN_BARANGAYS.find(
    (barangay) => normalizeBarangay(barangay) === normalized,
  ) || '';
};

export const isCabaganBarangay = (value?: string) => Boolean(findCabaganBarangay(value));
