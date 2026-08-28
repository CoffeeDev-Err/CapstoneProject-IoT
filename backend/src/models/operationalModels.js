const mongoose = require('mongoose')
const { OPERATIONAL_LIMITS, REPORT_TYPES } = require('../utils/operationalValidation')
const { pointSchema } = require('./geoSchemas')
const model = require('./modelFactory')

const deploymentSchema = new mongoose.Schema({
	assignmentId: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.deploymentId },
	groupId: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.deploymentGroupId },
	personnelId: { type: String, required: true, maxlength: 100 },
	personnelName: { type: String, required: true, maxlength: 100 },
	rank: { type: String, required: true, maxlength: 80 },
	barangayCode: { type: String, trim: true, uppercase: true },
	patrolArea: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.deploymentArea },
	shiftStart: Date,
	shiftEnd: Date,
	instructions: { type: String, default: '', maxlength: OPERATIONAL_LIMITS.deploymentInstructions },
	assignedBy: { type: String, default: 'supervisor' },
	assignedAt: { type: Date, default: Date.now },
	location: { type: pointSchema, required: true },
	status: { type: String, enum: ['scheduled', 'active', 'completed', 'cancelled'], default: 'active' },
	acknowledgedAt: Date,
	acknowledgedSignature: String,
	upcomingReminderSentFor: String,
}, {
	collection: 'deployments',
	timestamps: true,
})
deploymentSchema.index({ assignmentId: 1 }, { unique: true })
deploymentSchema.index({ personnelId: 1, status: 1 })
deploymentSchema.index({ barangayCode: 1, status: 1 })
deploymentSchema.index({ shiftStart: -1 })
deploymentSchema.index({ status: 1, shiftStart: 1, shiftEnd: 1 })
deploymentSchema.index({ personnelId: 1, shiftStart: 1, shiftEnd: 1 })
deploymentSchema.index({ status: 1, assignedAt: -1, _id: -1 })

const resolutionSchema = new mongoose.Schema({
	resolvedAt: Date,
	resolvedBy: String,
	notes: { type: String, default: '', maxlength: OPERATIONAL_LIMITS.resolutionNotes },
}, { _id: false })

const reportEvidenceSchema = new mongoose.Schema({
	path: { type: String, required: true },
	originalName: { type: String, default: '' },
	mimeType: { type: String, required: true },
	size: { type: Number, min: 0, required: true },
	cameraFacing: { type: String, enum: ['front', 'back'], default: 'back' },
	capturedAt: { type: Date, required: true },
}, { _id: false })

const reportRoutePointSchema = new mongoose.Schema({
	location: { type: pointSchema, required: true },
	accuracy: { type: Number, min: 0.1, max: 5000 },
	speed: { type: Number, min: 0, max: 300 },
	heading: { type: Number, min: 0, max: 359.999 },
	source: { type: String, enum: ['gps', 'mock'], default: 'gps' },
	recordedAt: { type: Date, required: true },
}, { _id: false })

const reportSchema = new mongoose.Schema({
	reportNumber: { type: String, required: true },
	clientSubmissionId: { type: String, trim: true, maxlength: 100 },
	submittedBy: { type: String, required: true },
	officerName: { type: String, required: true },
	assignedArea: { type: String, default: 'Unassigned area', maxlength: OPERATIONAL_LIMITS.deploymentArea },
	barangayCode: { type: String, trim: true, uppercase: true, default: 'UNSPECIFIED' },
	reportType: { type: String, required: true, lowercase: true, enum: REPORT_TYPES },
	isIncident: { type: Boolean, required: true },
	severity: { type: Number, min: 1, max: 5, default: 1 },
	validationStatus: { type: String, enum: ['pending', 'validated', 'rejected'], default: 'pending' },
	caseStatus: { type: String, enum: ['open', 'resolved', 'not_applicable'], required: true },
	title: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.reportTitle },
	description: { type: String, default: '', maxlength: OPERATIONAL_LIMITS.reportDescription },
	locationName: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.reportLocation },
	location: pointSchema,
	locationSource: {
		type: String,
		enum: ['gps', 'manual'],
		default: 'manual',
	},
	submittedFrom: pointSchema,
	incidentAt: { type: Date, required: true },
	submittedAt: { type: Date, required: true, default: Date.now },
	evidencePhoto: reportEvidenceSchema,
	routeSnapshot: { type: [reportRoutePointSchema], default: [] },
	routeSnapshotCapturedAt: Date,
	resolution: resolutionSchema,
}, {
	collection: 'reports',
	timestamps: true,
})
reportSchema.index({ reportNumber: 1 }, { unique: true })
reportSchema.index(
	{ submittedBy: 1, clientSubmissionId: 1 },
	{
		unique: true,
		partialFilterExpression: { clientSubmissionId: { $type: 'string' } },
	},
)
reportSchema.index({ submittedAt: -1, _id: -1 })
reportSchema.index({ submittedBy: 1, submittedAt: -1, _id: -1 })
reportSchema.index({ barangayCode: 1, incidentAt: -1 })
reportSchema.index({ reportType: 1, caseStatus: 1, incidentAt: -1 })
reportSchema.index({ reportType: 1, submittedAt: -1, _id: -1 })
reportSchema.index({ caseStatus: 1, submittedAt: -1, _id: -1 })
reportSchema.index({ validationStatus: 1, submittedAt: -1, _id: -1 })
reportSchema.index({ severity: -1, submittedAt: -1, _id: -1 })
reportSchema.index({ location: '2dsphere' })

const responderSchema = new mongoose.Schema({
	personnelId: { type: String, required: true },
	acceptedAt: { type: Date, default: Date.now },
}, { _id: false })

const taskSchema = new mongoose.Schema({
	taskId: { type: String, required: true },
	type: { type: String, enum: ['backup', 'urgent'], default: 'backup' },
	title: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.taskTitle },
	description: { type: String, default: '', maxlength: OPERATIONAL_LIMITS.taskDescription },
	requestedBy: { type: String, required: true },
	requesterName: { type: String, required: true },
	requiredResponders: { type: Number, min: 1, max: 5, default: 3 },
	responders: { type: [responderSchema], default: [] },
	barangayCode: { type: String, trim: true, uppercase: true },
	locationName: { type: String, required: true, maxlength: OPERATIONAL_LIMITS.taskLocation },
	location: { type: pointSchema, required: true },
	status: { type: String, enum: ['open', 'full', 'completed', 'cancelled'], default: 'open' },
	completedAt: Date,
	cancelledAt: Date,
}, {
	collection: 'tasks',
	timestamps: true,
})
taskSchema.index({ taskId: 1 }, { unique: true })
taskSchema.index({ status: 1, createdAt: -1, _id: -1 })
taskSchema.index({ requestedBy: 1, createdAt: -1, _id: -1 })
taskSchema.index({ 'responders.personnelId': 1, status: 1 })

module.exports = {
	Deployment: model('Deployment', deploymentSchema),
	Report: model('Report', reportSchema),
	Task: model('Task', taskSchema),
}
