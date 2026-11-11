const {
	CurrentLocation,
	Deployment,
	GpsDeviceAssignment,
	LocationHistory,
	DutyGpsHour,
	Personnel,
} = require('../models')
const { createNotification, deliverNotification } = require('./notificationService')
const createLocationIngestionService = require('./personnel/locationIngestionService')
const createMockMovementService = require('./personnel/mockMovementService')
const createPersonnelLifecycleService = require('./personnel/lifecycleService')
const createPersonnelQueryService = require('./personnel/queryService')
const createDutyGpsHistoryService = require('./personnel/dutyGpsHistoryService')

const dutyHistoryService = createDutyGpsHistoryService({
	models: { Deployment, DutyGpsHour, LocationHistory, Personnel },
})

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
	dutyHistoryService,
})
const {
	evaluatePersonnelBattery,
	evaluatePersonnelGeofences,
	evaluatePersonnelGpsAvailability,
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

const evaluatePatrolCoverage = require('./patrolCoverageService').createPatrolCoverageService({
	Deployment, CurrentLocation, deliverNotification,
})

module.exports = {
	evaluatePatrolCoverage,
	getDutyGpsHistory: dutyHistoryService.getHistory,
	emitPersonnelCollection,
	evaluatePersonnelBattery,
	evaluatePersonnelGeofences,
	evaluatePersonnelGpsAvailability,
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
