const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const createReportRouteService = require('../src/services/operations/reportRouteService')

const queryResult = (value) => ({
	sort: () => ({ lean: async () => value }),
	lean: async () => value,
})

describe('report route service', () => {
	it('persists later fixes at finalization and retains the snapshot after live history expires', async () => {
		const at = new Date('2026-10-06T06:00:00Z')
		let history = [{ location: { type: 'Point', coordinates: [121.7, 17.4] }, recordedAt: at, source: 'gps' }]
		let time = new Date('2026-10-06T06:01:00Z')
		let saves = 0
		const report = { reportNumber: 'R-FINAL', submittedBy: 'P-1', incidentAt: at, save: async () => { saves++ } }
		const service = createReportRouteService({ now: () => time,
			Report: { findOne: () => queryResult(report), find: () => ({ limit: async () => [report] }) },
			LocationHistory: { find: query => {
				assert.equal(query.recordedAt.$lte.toISOString(), '2026-10-06T06:15:00.000Z')
				return queryResult(history)
			} },
		})
		await service.captureSnapshot(report)
		assert.equal(report.routeSnapshot.length, 1)
		history.push({ ...history[0], location: { type: 'Point', coordinates: [121.701, 17.401] }, recordedAt: new Date('2026-10-06T06:14:00Z') })
		time = new Date('2026-10-06T06:16:00Z')
		assert.equal(await service.finalizeSnapshots(), 1)
		assert.equal(report.routeSnapshot.length, 2)
		assert.equal(saves, 2)
		history = []
		assert.equal((await service.getRoute('R-FINAL')).points.length, 2)
		assert.equal(saves, 2)
	})
	it('keeps route collection open for all report types and loads later readings without changing raw snapshots', async () => {
		for (const reportType of ['incident', 'checkpoint', 'patrol', 'other']) {
			let time = new Date('2026-10-06T06:01:00Z')
			const snapshot = [{ location: { type: 'Point', coordinates: [121.7, 17.4] }, recordedAt: new Date('2026-10-06T06:00:00Z') }]
			const report = { reportNumber: 'R-1', submittedBy: 'P-1', incidentAt: new Date('2026-10-06T06:00:00Z'), reportType, routeSnapshot: snapshot }
			const original = JSON.stringify(report)
			const later = { ...snapshot[0], recordedAt: new Date('2026-10-06T06:10:00Z') }
			const history = []
			let matched = 0
			const service = createReportRouteService({
				Report: { findOne: () => queryResult(report) },
				LocationHistory: { find: query => { assert.equal(query.source, 'gps'); return queryResult(history) } },
				now: () => time,
				roadMatchingService: { isAvailable: () => true, match: async samples => { matched++; assert.equal(samples.length, 2); return { status: 'matched', inference: true, segments: [] } } },
			})
			const first = await service.getRoute('R-1')
			assert.equal(first.window.complete, false)
			assert.equal(first.window.from, '2026-10-06T05:30:00.000Z')
			assert.equal(first.window.to, '2026-10-06T06:15:00.000Z')
			assert.equal(first.points.length, 1)
			assert.equal(matched, 0)
			history.push(later); time = new Date('2026-10-06T06:16:00Z')
			const final = await service.getRoute('R-1', { roadMatch: true })
			assert.equal(final.window.complete, true)
			assert.equal(final.points.length, 2)
			assert.equal(final.road_matching.status, 'matched')
			assert.equal(matched, 1)
			assert.equal(JSON.stringify(report), original)
		}
	})
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
