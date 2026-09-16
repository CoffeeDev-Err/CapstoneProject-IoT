const assert = require('node:assert/strict')
const { it } = require('node:test')
const createReportService = require('../src/services/operations/reportService')

it('combines analytics period, category, validation, case and Cabagan filters in the DB query', async () => {
  let captured
  const Report = {
    find(filter) { captured = filter; return { sort() { return this }, skip() { return this }, limit() { return this }, lean: async () => [] } },
    countDocuments: async () => 0,
  }
  const service = createReportService({ models: { Report }, loadPersonnelMap: async () => new Map(),
    personnelService: {}, notificationService: {}, publish: {} })
  await service.listReports({ from: '2026-08-31T16:00:00.000Z', to: '2026-09-15T15:59:59.999Z',
    category: 'incident', validation_status: 'validated', case_status: 'resolved', barangay: 'San Juan', scope: 'cabagan' }, { role: 'supervisor' })
  assert.equal(captured.isIncident, true)
  assert.equal(captured.validationStatus, 'validated')
  assert.equal(captured.caseStatus, 'resolved')
  assert.equal(captured.barangayCode, 'SAN-JUAN')
  assert.equal(captured.submittedAt.$gte.toISOString(), '2026-08-31T16:00:00.000Z')
  assert.ok(captured.$and.some((condition) => condition.barangayCode.$in.includes('SAN-JUAN')))
})
