const mongoose = require('mongoose')
const model = require('./modelFactory')

const fleetWeek = new mongoose.Schema({
	weekStart: { type: String, required: true, unique: true },
	weekEnd: { type: Date, required: true },
	crews: [{
		_id: false,
		vehicleId: { type: String, enum: ['car-1', 'car-2', 'motorcycle-1'], required: true },
		driverId: { type: String, required: true },
		personnelIds: { type: [String], required: true },
	}],
	createdBy: String,
}, { collection: 'fleet_weeks', timestamps: true })

module.exports = { FleetWeek: model('FleetWeek', fleetWeek) }
