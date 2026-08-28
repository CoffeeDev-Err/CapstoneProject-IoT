const { asDate } = require('./domain')

const REPORT_ROUTE_BEFORE_MS = 30 * 60 * 1000
const REPORT_ROUTE_AFTER_MS = 15 * 60 * 1000
const REPORT_ROUTE_FINALIZE_MAX_AGE_MS = 25 * 60 * 60 * 1000
const REPORT_ROUTE_FINALIZE_BATCH = 25

const getReportRouteWindow = (report) => {
	const incidentAt = asDate(report.incidentAt)
	return {
		from: new Date(incidentAt.getTime() - REPORT_ROUTE_BEFORE_MS),
		to: new Date(incidentAt.getTime() + REPORT_ROUTE_AFTER_MS),
	}
}

const serializeRoutePoint = (entry) => ({
	latitude: entry.location.coordinates[1],
	longitude: entry.location.coordinates[0],
	accuracy: entry.accuracy ?? null,
	speed: entry.speed ?? null,
	heading: entry.heading ?? null,
	source: entry.source || 'gps',
	recorded_at: new Date(entry.recordedAt).toISOString(),
})

const createReportRouteService = ({ Report, LocationHistory, now = () => new Date() }) => {
	const computeSnapshot = async (report) => {
		const { from, to } = getReportRouteWindow(report)
		const history = await LocationHistory.find({
			personnelId: report.submittedBy,
			recordedAt: { $gte: from, $lte: to },
			source: 'gps',
		}).sort({ recordedAt: 1 }).lean()

		const merged = new Map()
		for (const entry of [...(report.routeSnapshot || []), ...history]) {
			const coordinates = entry.location?.coordinates
			const recordedAt = new Date(entry.recordedAt)
			if (!Array.isArray(coordinates)
				|| coordinates.length !== 2
				|| Number.isNaN(recordedAt.getTime())) continue
			const key = `${recordedAt.toISOString()}:${coordinates.join(',')}`
			merged.set(key, {
				location: entry.location,
				accuracy: entry.accuracy,
				speed: entry.speed,
				heading: entry.heading,
				source: entry.source || 'gps',
				recordedAt,
			})
		}
		return {
			from,
			to,
			points: [...merged.values()].sort((left, right) => left.recordedAt - right.recordedAt),
		}
	}

	const captureSnapshot = async (report) => {
		const { from, to, points } = await computeSnapshot(report)
		report.routeSnapshot = points
		report.routeSnapshotCapturedAt = now()
		await report.save()
		return { from, to, points: report.routeSnapshot }
	}

	const finalizeSnapshots = async ({ now: requestedNow = now() } = {}) => {
		const windowClosedAt = { $add: ['$incidentAt', REPORT_ROUTE_AFTER_MS] }
		const reports = await Report.find({
			incidentAt: { $gte: new Date(requestedNow.getTime() - REPORT_ROUTE_FINALIZE_MAX_AGE_MS) },
			$expr: {
				$and: [
					{ $lte: [windowClosedAt, requestedNow] },
					{
						$or: [
							{ $eq: [{ $ifNull: ['$routeSnapshotCapturedAt', null] }, null] },
							{ $lt: ['$routeSnapshotCapturedAt', windowClosedAt] },
						],
					},
				],
			},
		}).limit(REPORT_ROUTE_FINALIZE_BATCH)

		let finalized = 0
		for (const report of reports) {
			try {
				await captureSnapshot(report)
				finalized += 1
			} catch {
				// Retry on the next lifecycle tick without aborting the batch.
			}
		}
		return finalized
	}

	const getRoute = async (reportId) => {
		const report = await Report.findOne({ reportNumber: reportId }).lean()
		if (!report) return null
		const { from, to, points } = await computeSnapshot(report)
		return {
			report_id: report.reportNumber,
			captured_at: report.routeSnapshotCapturedAt?.toISOString(),
			window: {
				from: from.toISOString(),
				to: to.toISOString(),
				complete: now().getTime() >= to.getTime(),
			},
			points: points.map(serializeRoutePoint),
		}
	}

	return { captureSnapshot, computeSnapshot, finalizeSnapshots, getRoute }
}

module.exports = createReportRouteService
module.exports.getReportRouteWindow = getReportRouteWindow
module.exports.serializeRoutePoint = serializeRoutePoint
