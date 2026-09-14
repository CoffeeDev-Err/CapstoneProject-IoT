const assert = require('node:assert/strict')
const { it } = require('node:test')
const createReportService = require('../src/services/operations/reportService')

const resolvedAt = new Date('2026-09-14T14:00:00.000Z')

const createFixture = () => {
	let storedReport = {
		_id: 'report-object-id',
		reportNumber: 'RPT-2026-RESOLVE1',
		submittedBy: 'PNP-001',
		officerName: 'Officer One',
		reportType: 'incident',
		isIncident: true,
		caseStatus: 'open',
		validationStatus: 'validated',
		title: 'Incident report',
		description: 'Incident details',
		locationName: 'Cabagan Public Market',
		locationSource: 'manual',
		barangayCode: 'CENTRO',
		incidentAt: new Date('2026-09-14T13:30:00.000Z'),
		submittedAt: new Date('2026-09-14T13:40:00.000Z'),
		history: [{ kind: 'review', reason: 'Validated by COP' }],
		__v: 3,
	}
	const copy = () => ({ ...storedReport, history: structuredClone(storedReport.history) })
	const Report = {
		findOne: async ({ reportNumber }) => reportNumber === storedReport.reportNumber ? copy() : null,
		findOneAndUpdate: async (filter, update) => {
			if (filter.reportNumber !== storedReport.reportNumber
				|| filter.submittedBy !== storedReport.submittedBy
				|| filter.isIncident !== storedReport.isIncident
				|| filter.caseStatus !== storedReport.caseStatus) return null
			storedReport = {
				...storedReport,
				...update.$set,
				__v: storedReport.__v + update.$inc.__v,
			}
			return copy()
		},
	}
	const notifications = []
	const realtimeEvents = []
	let dashboardUpdates = 0
	const service = createReportService({
		io: { emit: (event) => { if (event === 'dashboard:updated') dashboardUpdates += 1 } },
		models: { Report },
		loadPersonnelMap: async () => new Map(),
		personnelService: {},
		notificationService: {
			deliverNotification: async (notification) => notifications.push(notification),
		},
		reportRouteService: {},
		publish: {
			emitToSupervisorAndPersonnel: (event, report) => realtimeEvents.push({ event, report }),
		},
		clock: () => resolvedAt,
	})
	return {
		dashboardUpdates: () => dashboardUpdates,
		notifications,
		realtimeEvents,
		service,
		storedReport: () => storedReport,
	}
}

it('atomically resolves an incident once when two requests arrive together', async () => {
	const fixture = createFixture()
	const input = { resolved_by: 'PNP-001', resolution_notes: 'Incident handled safely.' }
	const results = await Promise.all([
		fixture.service.resolveReport('RPT-2026-RESOLVE1', input),
		fixture.service.resolveReport('RPT-2026-RESOLVE1', input),
	])

	assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409])
	const conflict = results.find(({ status }) => status === 409)
	assert.equal(conflict.body.code, 'REPORT_ALREADY_RESOLVED')
	assert.equal(fixture.storedReport().caseStatus, 'resolved')
	assert.equal(fixture.storedReport().resolution.resolvedAt, resolvedAt)
	assert.equal(fixture.storedReport().__v, 4)
	assert.deepEqual(fixture.storedReport().history, [{ kind: 'review', reason: 'Validated by COP' }])
	assert.equal(fixture.notifications.length, 1)
	assert.equal(fixture.realtimeEvents.length, 1)
	assert.equal(fixture.dashboardUpdates(), 1)
})

it('keeps the original resolution and side effects unchanged on later attempts', async () => {
	const fixture = createFixture()
	const first = await fixture.service.resolveReport('RPT-2026-RESOLVE1', {
		resolved_by: 'PNP-001', resolution_notes: 'Original resolution.',
	})
	const originalResolution = structuredClone(fixture.storedReport().resolution)
	const originalRevision = fixture.storedReport().__v
	const repeated = await fixture.service.resolveReport('RPT-2026-RESOLVE1', {
		resolved_by: 'PNP-001', resolution_notes: 'Attempted replacement.',
	})

	assert.equal(first.status, 200)
	assert.equal(repeated.status, 409)
	assert.equal(repeated.body.code, 'REPORT_ALREADY_RESOLVED')
	assert.deepEqual(fixture.storedReport().resolution, originalResolution)
	assert.equal(fixture.storedReport().__v, originalRevision)
	assert.equal(fixture.notifications.length, 1)
	assert.equal(fixture.realtimeEvents.length, 1)
	assert.equal(fixture.dashboardUpdates(), 1)
})
