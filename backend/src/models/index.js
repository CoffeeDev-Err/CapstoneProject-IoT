const mongoose = require('mongoose')

const pointSchema = new mongoose.Schema({
	type: {
		type: String,
		enum: ['Point'],
		default: 'Point',
		required: true,
	},
	coordinates: {
		type: [Number],
		default: [121.7681, 17.4239],
		required: true,
		validate: {
			validator: (coordinates) => (
				Array.isArray(coordinates)
				&& coordinates.length === 2
				&& coordinates.every(Number.isFinite)
			),
			message: 'GeoJSON coordinates must be [longitude, latitude].',
		},
	},
}, { _id: false })

const userSchema = new mongoose.Schema({
	username: { type: String, required: true, trim: true, lowercase: true },
	email: { type: String, trim: true, lowercase: true },
	emailVerifiedAt: Date,
	passwordHash: { type: String, required: true, select: false },
	role: { type: String, enum: ['supervisor', 'officer'], default: 'officer' },
	personnelId: { type: String, trim: true },
	photoUrl: { type: String, trim: true, default: '' },
	status: { type: String, enum: ['active', 'inactive'], default: 'active' },
	forcePasswordReset: { type: Boolean, default: true },
	lastLoginAt: Date,
}, {
	collection: 'users',
	timestamps: true,
})
userSchema.index({ username: 1 }, { unique: true })
userSchema.index(
	{ email: 1 },
	{ unique: true, partialFilterExpression: { email: { $type: 'string' } } },
)
userSchema.index({ personnelId: 1 })
userSchema.index({ status: 1 })

const personnelSchema = new mongoose.Schema({
	personnelId: { type: String, required: true, trim: true },
	badgeNumber: { type: String, required: true, trim: true, uppercase: true },
	fullName: { type: String, required: true, trim: true },
	rank: { type: String, required: true, trim: true },
	mobileNumber: { type: String, trim: true, default: '' },
	photoUrl: { type: String, trim: true, default: '' },
	dutyStatus: { type: String, trim: true, default: 'Off Duty' },
	defaultLocationName: { type: String, trim: true, default: 'Cabagan Police Station' },
	status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, {
	collection: 'personnel',
	timestamps: true,
})
personnelSchema.index({ personnelId: 1 }, { unique: true })
personnelSchema.index({ badgeNumber: 1 }, { unique: true })
personnelSchema.index({ dutyStatus: 1 })
personnelSchema.index({ status: 1 })

const gpsDeviceAssignmentSchema = new mongoose.Schema({
	assignmentId: { type: String, required: true },
	personnelId: { type: String, required: true },
	flespiDeviceId: { type: String, required: true },
	imei: { type: String, required: true, trim: true },
	deviceName: { type: String, trim: true, default: '' },
	assignedBy: { type: String, default: 'supervisor' },
	assignedAt: { type: Date, default: Date.now },
	unassignedAt: Date,
	status: { type: String, enum: ['active', 'released'], default: 'active' },
}, {
	collection: 'gps_device_assignments',
	timestamps: true,
})
gpsDeviceAssignmentSchema.index({ assignmentId: 1 }, { unique: true })
gpsDeviceAssignmentSchema.index(
	{ personnelId: 1 },
	{ unique: true, partialFilterExpression: { status: 'active' } },
)
gpsDeviceAssignmentSchema.index(
	{ imei: 1 },
	{ unique: true, partialFilterExpression: { status: 'active' } },
)
gpsDeviceAssignmentSchema.index({ assignedAt: -1 })

const currentLocationSchema = new mongoose.Schema({
	personnelId: { type: String, required: true },
	deviceAssignmentId: String,
	locationName: { type: String, default: 'Location unavailable' },
	location: { type: pointSchema, required: true },
	accuracy: Number,
	speed: Number,
	heading: Number,
	batteryLevel: Number,
	source: { type: String, enum: ['gps', 'mock'], default: 'mock' },
	isSimulated: { type: Boolean, default: true },
	recordedAt: { type: Date, required: true, default: Date.now },
	receivedAt: { type: Date, required: true, default: Date.now },
	lastMovedAt: { type: Date, default: Date.now },
	inactivityAlertedAt: Date,
	geofenceStatus: { type: String, enum: ['inside', 'outside'] },
	geofenceBoundaryId: String,
	geofenceTransitionAt: Date,
}, {
	collection: 'current_locations',
	timestamps: true,
})
currentLocationSchema.index({ personnelId: 1 }, { unique: true })
currentLocationSchema.index({ location: '2dsphere' })
currentLocationSchema.index({ recordedAt: -1 })

const locationHistorySchema = new mongoose.Schema({
	personnelId: { type: String, required: true },
	deviceAssignmentId: String,
	location: { type: pointSchema, required: true },
	accuracy: Number,
	speed: Number,
	heading: Number,
	source: { type: String, enum: ['gps', 'mock'], default: 'mock' },
	isSimulated: { type: Boolean, default: true },
	recordedAt: { type: Date, required: true, default: Date.now },
}, {
	collection: 'location_history',
	timestamps: false,
})
locationHistorySchema.index({ personnelId: 1, recordedAt: -1 })
locationHistorySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 86400 })

const polygonSchema = new mongoose.Schema({
	type: { type: String, enum: ['Polygon'], default: 'Polygon' },
	coordinates: { type: [[[Number]]], default: undefined },
}, { _id: false })

const barangaySchema = new mongoose.Schema({
	code: { type: String, required: true, trim: true, uppercase: true },
	psgcCode: { type: String, trim: true },
	name: { type: String, required: true, trim: true },
	municipality: { type: String, default: 'Cabagan', trim: true },
	center: { type: pointSchema, required: true },
	boundary: polygonSchema,
	active: { type: Boolean, default: true },
}, {
	collection: 'barangays',
	timestamps: true,
})
barangaySchema.index({ code: 1 }, { unique: true })
barangaySchema.index({ municipality: 1, name: 1 }, { unique: true })
barangaySchema.index({ boundary: '2dsphere' }, { sparse: true })

const deploymentSchema = new mongoose.Schema({
	assignmentId: { type: String, required: true },
	groupId: { type: String, required: true },
	personnelId: { type: String, required: true },
	personnelName: { type: String, required: true },
	rank: { type: String, required: true },
	barangayCode: { type: String, trim: true, uppercase: true },
	patrolArea: { type: String, required: true },
	shiftStart: Date,
	shiftEnd: Date,
	instructions: { type: String, default: '' },
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

const resolutionSchema = new mongoose.Schema({
	resolvedAt: Date,
	resolvedBy: String,
	notes: { type: String, default: '' },
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
	accuracy: Number,
	speed: Number,
	heading: Number,
	source: { type: String, enum: ['gps', 'mock'], default: 'gps' },
	recordedAt: { type: Date, required: true },
}, { _id: false })

const reportSchema = new mongoose.Schema({
	reportNumber: { type: String, required: true },
	submittedBy: { type: String, required: true },
	officerName: { type: String, required: true },
	assignedArea: { type: String, default: 'Unassigned area' },
	barangayCode: { type: String, trim: true, uppercase: true, default: 'UNSPECIFIED' },
	reportType: { type: String, required: true, lowercase: true },
	isIncident: { type: Boolean, required: true },
	severity: { type: Number, min: 1, max: 5, default: 1 },
	validationStatus: { type: String, enum: ['pending', 'validated', 'rejected'], default: 'pending' },
	caseStatus: { type: String, enum: ['open', 'resolved', 'not_applicable'], required: true },
	title: { type: String, required: true },
	description: { type: String, default: '' },
	locationName: { type: String, required: true },
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
reportSchema.index({ submittedAt: -1, _id: -1 })
reportSchema.index({ submittedBy: 1, submittedAt: -1, _id: -1 })
reportSchema.index({ barangayCode: 1, incidentAt: -1 })
reportSchema.index({ reportType: 1, caseStatus: 1, incidentAt: -1 })
reportSchema.index({ location: '2dsphere' })

const responderSchema = new mongoose.Schema({
	personnelId: { type: String, required: true },
	acceptedAt: { type: Date, default: Date.now },
}, { _id: false })

const taskSchema = new mongoose.Schema({
	taskId: { type: String, required: true },
	type: { type: String, enum: ['backup', 'urgent'], default: 'backup' },
	title: { type: String, required: true },
	description: { type: String, default: '' },
	requestedBy: { type: String, required: true },
	requesterName: { type: String, required: true },
	requiredResponders: { type: Number, min: 1, max: 5, default: 3 },
	responders: { type: [responderSchema], default: [] },
	barangayCode: { type: String, trim: true, uppercase: true },
	locationName: { type: String, required: true },
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

const notificationSchema = new mongoose.Schema({
	notificationId: { type: String, required: true },
	recipientId: { type: String, required: true, default: 'supervisor' },
	type: { type: String, default: 'info' },
	title: { type: String, required: true },
	message: { type: String, required: true },
	referenceType: String,
	referenceId: String,
	priority: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
	data: mongoose.Schema.Types.Mixed,
	dedupeKey: String,
	isRead: { type: Boolean, default: false },
	readAt: Date,
}, {
	collection: 'notifications',
	timestamps: true,
})
notificationSchema.index({ notificationId: 1 }, { unique: true })
notificationSchema.index({ recipientId: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index(
	{ recipientId: 1, dedupeKey: 1 },
	{ unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
)

const pushDeviceSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	personnelId: { type: String, required: true, trim: true },
	expoPushToken: { type: String, required: true, trim: true },
	platform: { type: String, enum: ['android', 'ios'], required: true },
	deviceName: { type: String, trim: true, default: '' },
	status: { type: String, enum: ['active', 'invalid', 'revoked'], default: 'active' },
	lastSeenAt: { type: Date, default: Date.now },
}, {
	collection: 'push_devices',
	timestamps: true,
})
pushDeviceSchema.index({ expoPushToken: 1 }, { unique: true })
pushDeviceSchema.index({ personnelId: 1, status: 1 })

const authSessionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	refreshTokenHash: { type: String, required: true, select: false },
	deviceName: String,
	lastUsedAt: { type: Date, default: Date.now },
	expiresAt: { type: Date, required: true },
	revokedAt: Date,
}, {
	collection: 'auth_sessions',
	timestamps: true,
})
authSessionSchema.index({ userId: 1, expiresAt: -1 })
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const emailVerificationSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	email: { type: String, required: true, trim: true, lowercase: true },
	purpose: {
		type: String,
		enum: ['verify_email', 'login', 'reset_password', 'change_password'],
		required: true,
	},
	otpHash: { type: String, required: true, select: false },
	attempts: { type: Number, default: 0 },
	maxAttempts: { type: Number, default: 5 },
	expiresAt: { type: Date, required: true },
	consumedAt: Date,
	requestIp: String,
	deviceName: String,
}, {
	collection: 'email_verifications',
	timestamps: true,
})
emailVerificationSchema.index({ userId: 1, purpose: 1, createdAt: -1 })
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const auditLogSchema = new mongoose.Schema({
	actorUserId: { type: String, default: 'supervisor' },
	action: { type: String, required: true },
	entityType: { type: String, required: true },
	entityId: { type: String, required: true },
	changes: mongoose.Schema.Types.Mixed,
	ipAddress: String,
}, {
	collection: 'audit_logs',
	timestamps: { createdAt: true, updatedAt: false },
})
auditLogSchema.index({ actorUserId: 1, createdAt: -1 })
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema)

const models = {
	User: model('User', userSchema),
	Personnel: model('PersonnelProfile', personnelSchema),
	GpsDeviceAssignment: model('GpsDeviceAssignment', gpsDeviceAssignmentSchema),
	CurrentLocation: model('CurrentLocation', currentLocationSchema),
	LocationHistory: model('LocationHistory', locationHistorySchema),
	Barangay: model('Barangay', barangaySchema),
	Deployment: model('Deployment', deploymentSchema),
	Report: model('Report', reportSchema),
	Task: model('Task', taskSchema),
	Notification: model('Notification', notificationSchema),
	PushDevice: model('PushDevice', pushDeviceSchema),
	AuthSession: model('AuthSession', authSessionSchema),
	EmailVerification: model('EmailVerification', emailVerificationSchema),
	AuditLog: model('AuditLog', auditLogSchema),
}

module.exports = models
