const mongoose = require('mongoose')
const { OPERATIONAL_LIMITS } = require('../utils/operationalValidation')
const { pointSchema, polygonSchema } = require('./geoSchemas')
const model = require('./modelFactory')

const personnelSchema = new mongoose.Schema({
	personnelId: { type: String, required: true, trim: true, maxlength: 100 },
	badgeNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
	fullName: { type: String, required: true, trim: true, maxlength: 100 },
	rank: { type: String, required: true, trim: true, maxlength: 80 },
	mobileNumber: { type: String, trim: true, default: '', maxlength: 13 },
	photoUrl: { type: String, trim: true, default: '', maxlength: 2048 },
	dutyStatus: { type: String, trim: true, default: 'Off Duty', maxlength: 50 },
	defaultLocationName: { type: String, trim: true, default: 'Cabagan Police Station', maxlength: OPERATIONAL_LIMITS.locationName },
	status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, {
	collection: 'personnel',
	timestamps: true,
})
personnelSchema.index({ personnelId: 1 }, { unique: true })
personnelSchema.index({ badgeNumber: 1 }, { unique: true })
personnelSchema.index({ dutyStatus: 1 })
personnelSchema.index({ status: 1 })
personnelSchema.index({ status: 1, fullName: 1, _id: 1 })

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
	locationName: { type: String, default: 'Location unavailable', maxlength: OPERATIONAL_LIMITS.locationName },
	location: { type: pointSchema, required: true },
	accuracy: { type: Number, min: 0.1, max: 5000 },
	speed: { type: Number, min: 0, max: 300 },
	heading: { type: Number, min: 0, max: 359.999 },
	batteryLevel: { type: Number, min: 0, max: 100 },
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
	accuracy: { type: Number, min: 0.1, max: 5000 },
	speed: { type: Number, min: 0, max: 300 },
	heading: { type: Number, min: 0, max: 359.999 },
	source: { type: String, enum: ['gps', 'mock'], default: 'mock' },
	isSimulated: { type: Boolean, default: true },
	recordedAt: { type: Date, required: true, default: Date.now },
}, {
	collection: 'location_history',
	timestamps: false,
})
locationHistorySchema.index({ personnelId: 1, recordedAt: -1 })
locationHistorySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 86400 })

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

module.exports = {
	Personnel: model('PersonnelProfile', personnelSchema),
	GpsDeviceAssignment: model('GpsDeviceAssignment', gpsDeviceAssignmentSchema),
	CurrentLocation: model('CurrentLocation', currentLocationSchema),
	LocationHistory: model('LocationHistory', locationHistorySchema),
	Barangay: model('Barangay', barangaySchema),
}
