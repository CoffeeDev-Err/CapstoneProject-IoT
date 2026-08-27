import assert from 'node:assert/strict'
import {
  BASELINE_REQUIRED_PERSONNEL,
  buildBarangayAnalytics,
} from '../src/utils/barangayAnalytics.js'

const referenceDate = new Date('2026-08-27T12:00:00+08:00')
const reports = [
  {
    id: 'RPT-TEST-001',
    barangay: 'Aggub',
    is_incident: true,
    validation_status: 'validated',
    case_status: 'open',
    severity: 3,
    location: 'Aggub Public Market',
    occurred_at: '2026-08-26T09:00:00+08:00',
  },
  {
    id: 'RPT-TEST-002',
    barangay: 'Aggub',
    is_incident: true,
    validation_status: 'validated',
    case_status: 'open',
    severity: 3,
    location: 'Aggub Public Market',
    occurred_at: '2026-08-27T17:00:00+08:00',
  },
]

const buildAggub = (deploymentCoverage) => buildBarangayAnalytics({
  reports,
  deploymentCoverage,
  period: 'weekly',
  referenceDate,
}).barangays[0]

const noDeployment = buildAggub([])
assert.equal(BASELINE_REQUIRED_PERSONNEL, 2)
assert.equal(noDeployment.requiredPersonnel, 2)
assert.equal(noDeployment.availablePersonnel, 0)
assert.equal(noDeployment.scoreBreakdown.coverageGap, 100)
assert.match(noDeployment.reasons.join(' '), /0 of 2 required personnel currently available/)

const legacyZeroRequirement = buildAggub([{
  barangay: 'Aggub',
  assignedPersonnel: 0,
  availablePersonnel: 0,
  requiredPersonnel: 0,
}])
assert.equal(legacyZeroRequirement.requiredPersonnel, 2)
assert.equal(legacyZeroRequirement.scoreBreakdown.coverageGap, 100)

const partialCoverage = buildAggub([{
  barangay: 'Aggub',
  assignedPersonnel: 1,
  availablePersonnel: 1,
  requiredPersonnel: BASELINE_REQUIRED_PERSONNEL,
}])
assert.equal(partialCoverage.scoreBreakdown.coverageGap, 50)

const completeCoverage = buildAggub([{
  barangay: 'Aggub',
  assignedPersonnel: 2,
  availablePersonnel: 2,
  requiredPersonnel: BASELINE_REQUIRED_PERSONNEL,
}])
assert.equal(completeCoverage.scoreBreakdown.coverageGap, 0)

console.log('Barangay analytics coverage-gap checks passed.')
