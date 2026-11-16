const assert = require('node:assert/strict')
const { it } = require('node:test')
const createReportService = require('../src/services/operations/reportService')
const now = new Date('2026-11-16T08:00:00Z')
const actor = { role: 'officer', personnelId: 'P-1', fullName: 'Officer One' }
const fix = { personnelId: 'P-1', source: 'gps', isSimulated: false, positionValid: true,
	accuracy: 5, satellites: 9, deviceAssignmentId: 'GPS-1', recordedAt: now,
	location: { type: 'Point', coordinates: [121.77, 17.42] } }
const submission = { personnel_id: 'P-1', report_type: 'incident', barangay: 'Catabayungan', title: 'Patrol observation',
	description: 'Observed during patrol.', location: 'Cabagan', location_source: 'gps',
	latitude: 17.42, longitude: 121.77, occurred_at: now.toISOString(), severity: 2 }
const fixture = (location) => {
	let writes = 0, created
	const document = { reportNumber: 'RPT-1', submittedBy: 'P-1', officerName: 'Officer One', __v: 0,
		title: 'Observation', description: 'Observed during patrol.', reportType: 'incident', isIncident: true,
		caseStatus: 'open', validationStatus: 'pending', barangayCode: 'CATABAYUNGAN', severity: 2,
		locationName: 'Cabagan', locationSource: 'manual', location: fix.location, incidentAt: now, submittedAt: now,
		save: async () => { writes++; document.__v++ } }
	const service = createReportService({ io: { emit: () => {} }, clock: () => now,
		models: {
			CurrentLocation: { findOne: () => ({ lean: async () => location }) },
			Deployment: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
			Report: { findOne: async () => document, create: async payload => { writes++; created = { ...payload, __v: 0 }; return created } },
		}, loadPersonnelMap: async () => new Map(), personnelService: { getPersonnelMember: async () => ({ id: 'P-1', name: 'Officer One' }) },
		notificationService: { deliverNotification: async () => {} }, reportRouteService: { captureSnapshot: async () => {} },
		publish: { emitToSupervisorAndPersonnel: () => {} },
	})
	return { service, document, created: () => created, writes: () => writes }
}

it('rejects simulated, network, invalid and poor GPS evidence on both report submission and correction', async () => {
	for (const extra of [{ source: 'mock' }, { isSimulated: true }, { positionValid: false },
		{ positionSource: 'lbs' }, { satellites: 2 }, { accuracy: 500 }, { recordedAt: undefined }]) {
		const f = fixture({ ...fix, ...extra })
		await assert.rejects(f.service.submitReport(submission), { status: 400, code: 'CURRENT_LOCATION_UNAVAILABLE' })
		await assert.rejects(f.service.editReport('RPT-1', { location_source: 'gps', revision: 0, reason: 'Correct position source' }, actor), { status: 400 })
		assert.equal(f.writes(), 0)
	}
})

it('stores measurement time and GPS quality with a report and a GPS correction', async () => {
	const f = fixture(fix)
	await f.service.submitReport(submission)
	assert.equal(+f.created().locationGpsEvidence.recordedAt, +now)
	assert.equal(f.created().locationGpsEvidence.deviceAssignmentId, 'GPS-1')
	assert.equal(f.created().submittedFromGpsEvidence.accuracy, 5)
	await f.service.editReport('RPT-1', { location_source: 'gps', revision: 0, reason: 'Correct position source' }, actor)
	assert.equal(f.document.locationGpsEvidence.source, 'gps')
	assert.equal(f.document.locationGpsEvidence.accuracy, 5)
	await f.service.editReport('RPT-1', { location_source: 'manual', revision: 1, reason: 'Use the actual incident point' }, actor)
	assert.equal(f.document.locationGpsEvidence, undefined)
	assert.equal(f.document.history.at(-1).changes.find(change => change.field === 'locationGpsEvidence').before.accuracy, 5)
})
