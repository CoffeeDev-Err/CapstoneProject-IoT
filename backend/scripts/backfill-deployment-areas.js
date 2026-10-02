require('dotenv').config()

const mongoose = require('mongoose')
const { Deployment, Report } = require('../src/models')
const { findPatrolArea } = require('../src/constants/patrolAreas')

const apply = process.argv.includes('--apply')

const requireMongoUri = () => {
	if (!/^mongodb(?:\+srv)?:\/\//i.test(String(process.env.MONGO_URI || ''))) {
		throw new Error('MONGO_URI is missing or invalid.')
	}
}

const legacyDeploymentUpdate = (deployment) => {
	const area = findPatrolArea(deployment.patrolArea)
	if (!area) return null
	return {
		updateOne: {
			filter: { _id: deployment._id, patrolAreaId: { $exists: false } },
			update: {
				$set: {
					patrolAreaId: area.id,
					patrolArea: area.name,
					deploymentType: area.category === 'route' ? 'route' : 'area',
					coverageBarangayCodes: area.coverageBarangayCodes,
					barangayCode: area.coverageBarangayCodes[0] || 'UNSPECIFIED',
					deploymentPointLabel: '',
				},
				// Old coordinates were generated reference centers, not supervisor-selected
				// posts. Removing them prevents historical area patrols from appearing as
				// precise fixed-post assignments.
				$unset: { location: 1 },
			},
		},
	}
}

const legacyReportUpdate = (report) => {
	const area = findPatrolArea(report.assignedArea)
	if (!area) return null
	return {
		updateOne: {
			filter: { _id: report._id, assignedAreaId: { $exists: false } },
			update: {
				$set: {
					assignedAreaId: area.id,
					assignedArea: area.name,
					assignedAreaType: area.category === 'route' ? 'route' : 'area',
					assignedBarangayCodes: area.coverageBarangayCodes,
					assignedLocationLabel: '',
				},
			},
		},
	}
}

const summarizeUnknown = (records, field) => [...new Set(records
	.filter((record) => !findPatrolArea(record[field]))
	.map((record) => String(record[field] || '(empty)')))]

const main = async () => {
	requireMongoUri()
	await mongoose.connect(process.env.MONGO_URI)

	const [deployments, reports] = await Promise.all([
		Deployment.find({ patrolAreaId: { $exists: false } })
			.select('_id patrolArea')
			.lean(),
		Report.find({
			assignedAreaId: { $exists: false },
			assignedArea: { $nin: [null, '', 'Unassigned area', 'No deployment recorded'] },
		})
			.select('_id assignedArea')
			.lean(),
	])

	const deploymentOperations = deployments.map(legacyDeploymentUpdate).filter(Boolean)
	const reportOperations = reports.map(legacyReportUpdate).filter(Boolean)
	const unknownDeploymentAreas = summarizeUnknown(deployments, 'patrolArea')
	const unknownReportAreas = summarizeUnknown(reports, 'assignedArea')

	console.log(`Legacy deployments eligible for backfill: ${deploymentOperations.length}`)
	console.log(`Historical reports eligible for backfill: ${reportOperations.length}`)
	if (unknownDeploymentAreas.length) {
		console.log(`Deployments requiring manual mapping: ${unknownDeploymentAreas.join(', ')}`)
	}
	if (unknownReportAreas.length) {
		console.log(`Reports requiring manual mapping: ${unknownReportAreas.join(', ')}`)
	}

	if (!apply) {
		console.log('Dry run only. Review these counts, back up the database, then re-run with --apply.')
		return
	}

	const [deploymentResult, reportResult] = await Promise.all([
		deploymentOperations.length
			? Deployment.bulkWrite(deploymentOperations, { ordered: false })
			: null,
		reportOperations.length
			? Report.bulkWrite(reportOperations, { ordered: false })
			: null,
	])
	console.log(`Deployments updated: ${deploymentResult?.modifiedCount || 0}`)
	console.log(`Reports updated: ${reportResult?.modifiedCount || 0}`)
}

main()
	.catch((error) => {
		console.error(`Deployment-area backfill failed: ${error.message}`)
		process.exitCode = 1
	})
	.finally(async () => {
		await mongoose.disconnect().catch(() => {})
	})

