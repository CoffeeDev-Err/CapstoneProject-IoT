const assert = require('node:assert/strict')
const { it } = require('node:test')
const createReportService = require('../src/services/operations/reportService')
const { editValues } = require('../src/services/operations/reportEdits')
const now = new Date('2026-09-09T08:00:00Z')
const officer = { role: 'officer', personnelId: 'officer-1', fullName: 'Officer One' }
function fixture(status = 'pending') {
  const document = { reportNumber: 'RPT-ONE', submittedBy: 'officer-1', officerName: 'Officer One',
    title: 'Original', description: 'Original description', reportType: 'incident', isIncident: true,
    caseStatus: 'open', validationStatus: status, barangayCode: 'CATABAYUNGAN', severity: 2,
    locationName: 'Catabayungan', locationSource: 'manual', incidentAt: now, submittedAt: now,
    assignedArea: 'Original assignment', evidencePhoto: { path: 'evidence.jpg', capturedAt: now },
    routeSnapshot: [], history: [], __v: 0,
    save: async function () { this.__v += 1 },
  }
  let saves = 0
  const save = document.save
  document.save = async () => { saves += 1; await save.call(document) }
  const Report = { findOne: async (filter) => filter.submittedBy && filter.submittedBy !== document.submittedBy ? null : document }
  const notifications = []
  const service = createReportService({ io: { emit: () => {} }, models: { Report }, clock: () => now,
    loadPersonnelMap: async () => new Map(), personnelService: {}, reportRouteService: {},
    notificationService: {
      createNotification: async (notification) => notifications.push(notification),
      deliverNotification: async (notification) => notifications.push(notification),
    },
    publish: { emitToSupervisorAndPersonnel: () => {} },
  })
  return { document, service, saves: () => saves, notifications }
}
it('records before/after values and preserves submission metadata and evidence', async () => {
  const f = fixture()
  const result = await f.service.editReport('RPT-ONE', { description: 'Corrected description', revision: 0, reason: 'Typo correction' }, officer)
  assert.equal(result.status, 200)
  assert.equal(f.document.description, 'Corrected description')
  assert.equal(f.document.assignedArea, 'Original assignment')
  assert.equal(f.document.submittedAt, now)
  assert.equal(f.document.evidencePhoto.path, 'evidence.jpg')
  assert.deepEqual(f.document.history[0].changes[0], { field: 'description', before: 'Original description', after: 'Corrected description' })
  assert.equal(result.body.report.revision, 1)
})
it('notifies the supervisor with the exact report after a correction', async () => {
  const f = fixture('validated')
  await f.service.editReport('RPT-ONE', {
    description: 'Corrected description', revision: 0, reason: 'Corrected facts',
  }, officer)
  assert.equal(f.notifications.length, 1)
  assert.equal(f.notifications[0].recipientId, 'supervisor')
  assert.equal(f.notifications[0].title, 'Report correction submitted')
  assert.equal(f.notifications[0].referenceType, 'report')
  assert.equal(f.notifications[0].referenceId, 'RPT-ONE')
  assert.equal(f.notifications[0].data.reportId, 'RPT-ONE')
})
it('notifies the supervisor with the exact report after a pending report edit', async () => {
  const f = fixture('pending')
  await f.service.editReport('RPT-ONE', {
    description: 'Updated while pending', revision: 0, reason: 'Corrected details',
  }, officer)
  assert.equal(f.notifications.length, 1)
  assert.equal(f.notifications[0].recipientId, 'supervisor')
  assert.equal(f.notifications[0].title, 'Report updated')
  assert.equal(f.notifications[0].referenceType, 'report')
  assert.equal(f.notifications[0].data.reportId, 'RPT-ONE')
})
it('notifies only the submitting officer after a COP review action', async () => {
  const f = fixture('pending')
  await f.service.updateReportValidation('RPT-ONE', {
    validation_status: 'validated', revision: 0,
  }, { role: 'supervisor', fullName: 'COP One' })
  assert.equal(f.notifications.length, 1)
  assert.equal(f.notifications[0].recipientId, 'officer-1')
  assert.equal(f.notifications[0].title, 'Report Review Updated')
  assert.equal(f.notifications.some((notification) => notification.recipientId === 'supervisor'), false)
})
for (const status of ['validated', 'rejected']) it(`returns ${status} reports to pending review after correction`, async () => {
  const f = fixture(status)
  await f.service.editReport('RPT-ONE', { title: 'Corrected title', revision: 0, reason: 'Incorrect title' }, officer)
  assert.equal(f.document.validationStatus, 'pending')
  assert.equal(f.document.history[0].kind, status === 'validated' ? 'correction' : 'edit')
  assert.equal(f.document.history[0].changes.at(-1).before, status)
})
it('rejects another officer and supervisor edits', async () => {
  const f = fixture()
  assert.equal((await f.service.editReport('RPT-ONE', {}, { ...officer, personnelId: 'other' })).status, 404)
  assert.equal((await f.service.editReport('RPT-ONE', {}, { role: 'supervisor' })).status, 403)
  assert.equal(f.saves(), 0)
})
it('rejects stale revisions, forbidden metadata, missing reasons, invalid dates and coordinates', () => {
  const { document } = fixture()
  const base = { title: 'Updated', revision: 0, reason: 'Fix' }
  for (const patch of [{ revision: 5 }, { reason: '' }, { personnel_id: 'other' }, { assigned_area: 'Other' },
    { occurred_at: 'invalid' }, { occurred_at: '2099-01-01' }, { latitude: 0, longitude: 0 }, { severity: 2.5 }]) {
    assert.throws(() => editValues(document, { ...base, ...patch }, now))
  }
})
it('prevents a correction or review from overwriting a concurrent update', async () => {
  const f = fixture()
  f.document.save = async () => { throw Object.assign(new Error('Race'), { name: 'VersionError' }) }
  await assert.rejects(f.service.editReport('RPT-ONE', { title: 'Updated', revision: 0, reason: 'Fix' }, officer), { status: 409, code: 'REPORT_CHANGED' })
  await assert.rejects(f.service.updateReportValidation('RPT-ONE', { validation_status: 'validated', revision: 0 }), { status: 409 })
})
it('rejects validation of a report revision that the reviewer has not seen', async () => {
  const f = fixture()
  f.document.__v = 2
  await assert.rejects(f.service.updateReportValidation('RPT-ONE', { validation_status: 'validated', revision: 1 }), { status: 409 })
  assert.equal(f.saves(), 0)
})
