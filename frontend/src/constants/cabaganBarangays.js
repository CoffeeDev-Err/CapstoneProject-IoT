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
]

const normalizeBarangay = (value = '') => String(value)
  .trim()
  .replace(/^barangay\s+/i, '')
  .replace(/\s+/g, ' ')
  .toLowerCase()

const cabaganBarangayLookup = new Map(
  CABAGAN_BARANGAYS.map((barangay) => [normalizeBarangay(barangay), barangay]),
)

export const findCabaganBarangay = (value) => (
  cabaganBarangayLookup.get(normalizeBarangay(value)) || ''
)

export const isCabaganBarangay = (value) => Boolean(findCabaganBarangay(value))
