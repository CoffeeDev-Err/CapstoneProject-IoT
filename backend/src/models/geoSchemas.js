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
					&& coordinates[0] >= -180
					&& coordinates[0] <= 180
					&& coordinates[1] >= -90
					&& coordinates[1] <= 90
			),
			message: 'GeoJSON coordinates must be valid [longitude, latitude] values.',
		},
	},
}, { _id: false })

const polygonSchema = new mongoose.Schema({
	type: { type: String, enum: ['Polygon'], default: 'Polygon' },
	coordinates: { type: [[[Number]]], default: undefined },
}, { _id: false })

module.exports = { pointSchema, polygonSchema }
