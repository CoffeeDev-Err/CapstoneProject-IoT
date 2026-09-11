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
		['unsupported location source', { location_source: 'prediction' }, /gps or manual/, 'location_source'],
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
