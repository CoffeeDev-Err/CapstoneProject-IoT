const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createReportService = require('../src/services/operations/reportService')

const now = new Date('2026-09-11T08:00:00Z')
const basePayload = {
	personnel_id: 'PNP-001',
	client_submission_id: 'mobile-valid-submission-001',
	report_type: 'incident',
	barangay: 'Catabayungan',
	title: 'Patrol observation',
	description: 'Observed and documented during patrol.',
	location: 'ISU Cabagan entrance',
	location_source: 'manual',
	occurred_at: now.toISOString(),
	severity: 2,
}

const createService = () => {
	let createCalls = 0
	const service = createReportService({
		io: { emit: () => {} },
		models: {
			CurrentLocation: { findOne: () => ({ lean: async () => null }) },
			Deployment: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
			Report: {
				create: async () => { createCalls += 1; throw new Error('Unexpected report creation') },
			},
		},
		loadPersonnelMap: async () => new Map(),
		personnelService: {
			getPersonnelMember: async () => ({ id: 'PNP-001', name: 'Officer One' }),
		},
		notificationService: { createNotification: async () => {}, deliverNotification: async () => {} },
		reportRouteService: { captureSnapshot: async () => {} },
		publish: { emitToSupervisorAndPersonnel: () => {} },
		clock: () => now,
	})
	return { service, createCalls: () => createCalls }
}

describe('report submission validation', () => {
	const cases = [
		['unsupported report type', { report_type: 'guess' }, /Report type must be one of/, 'report_type'],
		['unknown barangay', { barangay: 'Atlantis' }, /26 official Cabagan barangays/, undefined],
		['blank title', { title: '   ' }, /Report title is required/, 'title'],
		['non-text description', { description: { malicious: true } }, /Report description must be text/, 'description'],
		['future date', { occurred_at: '2026-09-12T08:00:00Z' }, /cannot be in the future/, 'occurred_at'],
		['decimal severity', { severity: 2.5 }, /whole number from 1 to 5/, 'severity'],
		['one invalid coordinate', { latitude: 'invalid', longitude: '' }, /valid latitude and longitude/, undefined],
		['coordinates outside Cabagan', { latitude: 14.5995, longitude: 120.9842 }, /inside Cabagan/, 'location'],
		['unsupported location source', { location_source: 'prediction' }, /gps, manual, or backup_request/, 'location_source'],
		['invalid submission identifier', { client_submission_id: 'bad' }, /submission identifier is invalid/, undefined],
	]

	for (const [name, patch, message, field] of cases) {
		it(`rejects ${name} with a matching validation message`, async () => {
			const fixture = createService()
			await assert.rejects(
				fixture.service.submitReport({ ...basePayload, ...patch }),
				(error) => {
					assert.equal(error.status, 400)
					assert.match(error.message, message)
					if (field) assert.equal(error.field, field)
					return true
				},
			)
			assert.equal(fixture.createCalls(), 0)
		})
	}
})

describe('backup response report linking', () => {
	const createLinkedBackupFixture = ({ requesterId = 'PNP-001', existingReport = null, duplicateOnCreate = false } = {}) => {
		let createdReport
		let reportLookupCount = 0
		const task = {
			taskId: 'TSK-2026-BACKUP1',
			type: 'backup',
			requestedBy: requesterId,
			requesterName: 'Officer One',
			assignedArea: 'Catabayungan',
			title: 'Immediate assistance needed',
			locationName: 'Catabayungan Public Market',
			location: { type: 'Point', coordinates: [121.765, 17.4305] },
			requiredResponders: 3,
			responders: [
				{ personnelId: 'PNP-002', acceptedAt: new Date('2026-09-11T07:52:00Z') },
				{ personnelId: 'PNP-003', acceptedAt: new Date('2026-09-11T07:53:00Z') },
			],
			status: 'completed',
			createdAt: new Date('2026-09-11T07:50:00Z'),
			completedAt: new Date('2026-09-11T07:58:00Z'),
			updatedAt: now,
			save: async () => {},
		}
		const Report = {
			findOne: () => ({ lean: async () => {
				reportLookupCount += 1
				return duplicateOnCreate && reportLookupCount > 1
					? { reportNumber: 'RPT-2026-RACEWIN' }
					: existingReport
			} }),
			create: async (payload) => {
				if (duplicateOnCreate) {
					const error = new Error('duplicate linked backup report')
					error.code = 11000
					error.keyPattern = { 'backupResponse.taskId': 1 }
					throw error
				}
				createdReport = { ...payload, _id: 'report-object-id', __v: 0 }
				return createdReport
			},
			deleteOne: async () => {},
		}
		const service = createReportService({
			io: { emit: () => {}, to: () => ({ emit: () => {} }) },
			models: {
				CurrentLocation: { findOne: () => ({ lean: async () => null }) },
				Deployment: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
				Report,
				Task: { findOne: async () => task },
			},
			loadPersonnelMap: async (ids) => new Map(ids.map((id) => [id, {
				personnelId: id,
				fullName: id === 'PNP-002' ? 'Responder Two' : id === 'PNP-003' ? 'Responder Three' : 'Officer One',
				rank: id === 'PNP-002' ? 'Police Corporal' : 'Police Staff Sergeant',
				badgeNumber: id === 'PNP-002' ? '12002' : '12003',
			}])),
			personnelService: {
				getPersonnelMember: async () => ({ id: 'PNP-001', name: 'Officer One' }),
			},
			notificationService: { deliverNotification: async () => {} },
			reportRouteService: { captureSnapshot: async () => {} },
			publish: { emitToSupervisorAndPersonnel: () => {} },
			clock: () => now,
			idGenerator: () => 'abc12345-fixed-id',
		})
		return { service, task, createdReport: () => createdReport }
	}

	it('stores an immutable responder snapshot and links the completed backup task', async () => {
		const fixture = createLinkedBackupFixture()
		const report = await fixture.service.submitReport({
			...basePayload,
			backup_task_id: fixture.task.taskId,
			location_source: 'backup_request',
		})

		assert.equal(report.backup_response.task_id, fixture.task.taskId)
		assert.equal(report.backup_response.responders.length, 2)
		assert.deepEqual(
			report.backup_response.responders.map((responder) => responder.name),
			['Responder Two', 'Responder Three'],
		)
		assert.equal(fixture.createdReport().assignedArea, 'Catabayungan')
		assert.equal(fixture.createdReport().locationName, 'Catabayungan Public Market')
		assert.equal(fixture.task.reportNumber, report.id)
	})

	it('prevents a different officer from reporting another officer backup request', async () => {
		const fixture = createLinkedBackupFixture({ requesterId: 'PNP-DIFFERENT' })
		await assert.rejects(
			fixture.service.submitReport({ ...basePayload, backup_task_id: fixture.task.taskId }),
			{ status: 403, code: 'BACKUP_REPORT_NOT_ALLOWED' },
		)
	})

	it('prevents a second report for the same completed backup request', async () => {
		const fixture = createLinkedBackupFixture({ existingReport: { reportNumber: 'RPT-2026-EXISTING' } })
		await assert.rejects(
			fixture.service.submitReport({ ...basePayload, backup_task_id: fixture.task.taskId }),
			{ status: 409, code: 'BACKUP_REPORT_EXISTS' },
		)
	})

	it('returns a clear conflict if simultaneous submissions race for the same backup request', async () => {
		const fixture = createLinkedBackupFixture({ duplicateOnCreate: true })
		await assert.rejects(
			fixture.service.submitReport({ ...basePayload, backup_task_id: fixture.task.taskId }),
			(error) => error.status === 409
				&& error.code === 'BACKUP_REPORT_EXISTS'
				&& /RPT-2026-RACEWIN/.test(error.message),
		)
	})
})
