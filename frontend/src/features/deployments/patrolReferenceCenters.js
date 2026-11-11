import centers from '../../../../contracts/cabagan-patrol-centers.json'
import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'

// Navigation references, not surveyed boundaries or exact deployment posts.
export const patrolBarangayReferences = CABAGAN_BARANGAYS.map(name => ({
  name: `Barangay ${name}`, category: 'barangay', coverageBarangays: [name],
  referenceCenter: centers[name.toUpperCase().replace(/\s+/g, '-')],
}))
