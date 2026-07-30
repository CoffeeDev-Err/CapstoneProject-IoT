const {
	Deployment,
	Personnel,
	Report,
	Task,
} = require('../models')
const { isCabaganBarangayCode } = require('../constants/cabaganBarangays')
const { barangayNameFromCode } = require('../utils/geo')

const PERIODS = new Set(['weekly', 'monthly', 'yearly'])

const getPeriodRange = (period, referenceDate = new Date()) => {
	const end = new Date(referenceDate)
	const start = new Date(referenceDate)

	if (period === 'yearly') {
		start.setMonth(0, 1)
		start.setHours(0, 0, 0, 0)
	} else if (period === 'monthly') {
		start.setDate(1)
		start.setHours(0, 0, 0, 0)
	} else {
		start.setDate(start.getDate() - 6)
		start.setHours(0, 0, 0, 0)
	}
	return { start, end }
}

const timeWindow = (date) => {
	const hour = date.getHours()
	if (hour < 6) return '12 AM - 6 AM'
	if (hour < 12) return '6 AM - 12 PM'
	if (hour < 18) return '12 PM - 6 PM'
	return '6 PM - 12 AM'
}

const buildOperationalAnalytics = async ({ period: requestedPeriod } = {}) => {
	const period = PERIODS.has(requestedPeriod) ? requestedPeriod : 'weekly'
	const { start, end } = getPeriodRange(period)
	const [reports, deployments, personnel] = await Promise.all([
		Report.find({ submittedAt: { $gte: start, $lte: end } })
			.sort({ submittedAt: 1 })
			.lean(),
		Deployment.find({ status: 'active' }).lean(),
		Personnel.find({ status: 'active' }).select('personnelId dutyStatus').lean(),
	])

	const activePersonnelIds = new Set(
		personnel
			.filter((member) => member.dutyStatus !== 'Off Duty')
			.map((member) => member.personnelId),
	)
	const deploymentCoverage = new Map()
	for (const deployment of deployments) {
		if (!isCabaganBarangayCode(deployment.barangayCode)) continue
		const coverage = deploymentCoverage.get(deployment.barangayCode) || {
			assigned: 0,
			available: 0,
		}
		coverage.assigned += 1
		if (activePersonnelIds.has(deployment.personnelId)) coverage.available += 1
		deploymentCoverage.set(deployment.barangayCode, coverage)
	}

	const byBarangay = new Map()
	for (const code of deploymentCoverage.keys()) {
		byBarangay.set(code, {
			code,
			reportCount: 0,
			incidentCount: 0,
			validatedIncidentCount: 0,
			resolvedCount: 0,
			severityTotal: 0,
			locations: new Map(),
			timeWindows: new Map(),
		})
	}
	const scopedReports = reports.filter(
		(report) => isCabaganBarangayCode(report.barangayCode),
	)
	for (const report of scopedReports) {
		const code = report.barangayCode || 'UNSPECIFIED'
		if (!byBarangay.has(code)) {
			byBarangay.set(code, {
				code,
				reportCount: 0,
				incidentCount: 0,
				validatedIncidentCount: 0,
				resolvedCount: 0,
				severityTotal: 0,
				locations: new Map(),
				timeWindows: new Map(),
			})
		}
		const item = byBarangay.get(code)
		item.reportCount += 1
		if (report.isIncident) {
			item.incidentCount += 1
			item.severityTotal += report.severity || 1
			if (report.validationStatus === 'validated') item.validatedIncidentCount += 1
			if (report.caseStatus === 'resolved') item.resolvedCount += 1
			item.locations.set(
				report.locationName,
				(item.locations.get(report.locationName) || 0) + 1,
			)
			const window = timeWindow(report.incidentAt)
			item.timeWindows.set(window, (item.timeWindows.get(window) || 0) + 1)
		}
	}

	const barangays = [...byBarangay.values()].map((item) => {
		const topLocationEntry = [...item.locations.entries()]
			.sort((left, right) => right[1] - left[1])[0]
		const peakTimeEntry = [...item.timeWindows.entries()]
			.sort((left, right) => right[1] - left[1])[0]
		const averageSeverity = item.incidentCount
			? Number((item.severityTotal / item.incidentCount).toFixed(1))
			: 0
		const repeatLocationCount = topLocationEntry?.[1] || 0
		const priorityScore = Number((
			item.validatedIncidentCount * 3
			+ averageSeverity * 2
			+ Math.max(0, repeatLocationCount - 1) * 2
		).toFixed(1))
		const priorityLevel = priorityScore >= 18
			? 'high'
			: priorityScore >= 9 ? 'medium' : 'low'
		const coverage = deploymentCoverage.get(item.code) || {
			assigned: 0,
			available: 0,
		}
		const requiredPersonnel = priorityLevel === 'high'
			? 5
			: priorityLevel === 'medium' ? 3 : 2

		return {
			code: item.code,
			barangay: barangayNameFromCode(item.code),
			reportCount: item.reportCount,
			incidentCount: item.incidentCount,
			validatedIncidentCount: item.validatedIncidentCount,
			resolvedCount: item.resolvedCount,
			averageSeverity,
			topLocation: topLocationEntry?.[0] || null,
			repeatLocationCount,
			peakTimeWindow: peakTimeEntry?.[0] || null,
			assignedPersonnel: coverage.assigned,
			availablePersonnel: coverage.available,
			requiredPersonnel,
			additionalPersonnelNeeded: Math.max(
				0,
				requiredPersonnel - coverage.available,
			),
			priorityScore,
			priorityLevel,
		}
	}).sort((left, right) => right.priorityScore - left.priorityScore)

	return {
		period,
		range: {
			from: start.toISOString(),
			to: end.toISOString(),
		},
		summary: {
			totalReports: scopedReports.length,
			totalIncidentReports: scopedReports.filter((report) => report.isIncident).length,
			totalValidatedIncidents: scopedReports.filter(
				(report) => report.isIncident && report.validationStatus === 'validated',
			).length,
			totalResolvedCases: scopedReports.filter(
				(report) => report.isIncident && report.caseStatus === 'resolved',
			).length,
			excludedOutsideCabaganReports: reports.length - scopedReports.length,
			highPriorityBarangays: barangays.filter(
				(barangay) => barangay.priorityLevel === 'high',
			).length,
		},
		barangays,
		disclaimer: 'Report volume is an activity signal, not a direct measure of crime.',
	}
}

const getDashboardSummary = async () => {
	const startOfDay = new Date()
	startOfDay.setHours(0, 0, 0, 0)
	const [
		totalPersonnel,
		activePersonnel,
		openTasks,
		reportsToday,
		openIncidents,
		recentReports,
		recentTasks,
		analytics,
		personnelProfiles,
	] = await Promise.all([
		Personnel.countDocuments({ status: 'active' }),
		Personnel.countDocuments({
			status: 'active',
			dutyStatus: { $ne: 'Off Duty' },
		}),
		Task.countDocuments({ status: { $in: ['open', 'full'] } }),
		Report.countDocuments({ submittedAt: { $gte: startOfDay } }),
		Report.countDocuments({ isIncident: true, caseStatus: 'open' }),
		Report.find().sort({ submittedAt: -1 }).limit(5).lean(),
		Task.find().sort({ createdAt: -1 }).limit(5).lean(),
		buildOperationalAnalytics({ period: 'weekly' }),
		Personnel.find({ status: 'active' })
			.select('personnelId fullName')
			.lean(),
	])
	const personnelNames = new Map(
		personnelProfiles.map((profile) => [profile.personnelId, profile.fullName]),
	)

	const recentActivity = [
		...recentReports.map((report) => ({
			id: report.reportNumber,
			type: 'report',
			timestamp: report.submittedAt.toISOString(),
			text: `${personnelNames.get(report.submittedBy) || report.officerName} submitted ${report.reportType} report ${report.reportNumber}.`,
		})),
		...recentTasks.map((task) => ({
			id: task.taskId,
			type: 'task',
			timestamp: task.createdAt.toISOString(),
			text: `${personnelNames.get(task.requestedBy) || task.requesterName} created ${task.type} task at ${task.locationName}.`,
		})),
	]
		.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
		.slice(0, 5)
	const coverage = analytics.barangays.map((barangay) => ({
		code: barangay.code,
		label: `Barangay ${barangay.barangay}`,
		assignedPersonnel: barangay.assignedPersonnel,
		availablePersonnel: barangay.availablePersonnel,
		requiredPersonnel: barangay.requiredPersonnel,
		percentage: Math.min(
			100,
			Math.round(
				(barangay.availablePersonnel / Math.max(1, barangay.requiredPersonnel)) * 100,
			),
		),
	}))

	return {
		totalPersonnel,
		activePersonnel,
		openTasks,
		reportsToday,
		openIncidents,
		recentActivity,
		coverage,
		generatedAt: new Date().toISOString(),
	}
}

module.exports = {
	buildOperationalAnalytics,
	getDashboardSummary,
}
