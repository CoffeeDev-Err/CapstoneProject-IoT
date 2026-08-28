const {
	CurrentLocation,
	Deployment,
	GpsDeviceAssignment,
	LocationHistory,
	Personnel,
} = require('../models')
const { createNotification, deliverNotification } = require('./notificationService')
const createLocationIngestionService = require('./personnel/locationIngestionService')
const createMockMovementService = require('./personnel/mockMovementService')
const createPersonnelLifecycleService = require('./personnel/lifecycleService')
const createPersonnelQueryService = require('./personnel/queryService')

const queryService = createPersonnelQueryService({
	models: { CurrentLocation, Deployment, LocationHistory, Personnel },
})
const {
	currentShiftFilter,
	emitPersonnelCollection,
	getLocationHistory,
	getPersonnelMember,
	getPersonnelWithLocations,
	listPersonnel,
	scopePersonnelForActor,
	serializePersonnel,
	updateDutyStatus,
} = queryService
const { ingestLocation } = createLocationIngestionService({
	models: {
		CurrentLocation,
		Deployment,
		GpsDeviceAssignment,
		LocationHistory,
		Personnel,
	},
	currentShiftFilter,
	serializePersonnel,
})
const {
	evaluatePersonnelGeofences,
	evaluatePersonnelInactivity,
} = createPersonnelLifecycleService({
	models: { CurrentLocation, Deployment, GpsDeviceAssignment, Personnel },
	currentShiftFilter,
	notificationService: { createNotification, deliverNotification },
})
const { updateMockLocations } = createMockMovementService({
	models: { CurrentLocation, GpsDeviceAssignment, LocationHistory },
	getPersonnelWithLocations,
})

module.exports = {
	emitPersonnelCollection,
	evaluatePersonnelGeofences,
	evaluatePersonnelInactivity,
	getPersonnelMember,
	getPersonnelWithLocations,
	getLocationHistory,
	ingestLocation,
	listPersonnel,
	scopePersonnelForActor,
	serializePersonnel,
	updateMockLocations,
	updateDutyStatus,
}
