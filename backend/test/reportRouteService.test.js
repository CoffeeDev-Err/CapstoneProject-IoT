const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createReportRouteService = require('../src/services/operations/reportRouteService')

const queryResult = (value) => ({
	sort: () => ({ lean: async () => value }),
	lean: async () => value,
})

describe('report route service', () => {
	it('merges stored and GPS points without duplicates and without mutating a GET', async () => {
		const incidentAt = new Date('2026-08-27T10:00:00.000Z')
		const sharedPoint = {
			location: { type: 'Point', coordinates: [121.7, 17.4] },
			recordedAt: new Date('2026-08-27T10:00:00.000Z'),
			source: 'gps',
			positionValid: true,
			satellites: 9,
			accuracy: 4,
		}
		const report = {
			reportNumber: 'R-1',
			submittedBy: 'P-1',
			incidentAt,
			routeSnapshot: [sharedPoint],
			routeSnapshotCapturedAt: new Date('2026-08-27T10:01:00.000Z'),
		}
		let saved = false
		const service = createReportRouteService({
			Report: { findOne: () => queryResult(report) },
			LocationHistory: { find: () => queryResult([sharedPoint, {
				...sharedPoint,
				location: { type: 'Point', coordinates: [121.71, 17.41] },
				recordedAt: new Date('2026-08-27T10:00:30.000Z'),
			}]) },
			now: () => new Date('2026-08-27T11:00:00.000Z'),
		})
		report.save = async () => { saved = true }
		const route = await service.getRoute('R-1')
		assert.equal(route.points.length, 2)
		assert.equal(route.points[0].position_valid, true)
		assert.equal(route.points[0].satellites, 9)
		assert.equal(route.points[0].accuracy, 4)
		assert.equal(route.window.complete, true)
		assert.equal(saved, false)
	})
})
