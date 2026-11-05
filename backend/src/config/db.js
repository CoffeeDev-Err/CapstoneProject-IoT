const mongoose = require('mongoose')
const ensureGpsHistoryRetention = require('./gpsHistoryRetention')
require('dotenv').config()

const connectDB = async () => {
	if (!process.env.MONGO_URI) {
		throw new Error('MONGO_URI is required. The API cannot start without persistent storage.')
	}

	await mongoose.connect(process.env.MONGO_URI, {
		serverSelectionTimeoutMS: 10_000,
		// Startup explicitly creates indexes in seedDatabase after the targeted TTL
		// migration. Avoid racing auto-index creation against the old 24-hour TTL.
		autoIndex: false,
	})
	await ensureGpsHistoryRetention(mongoose.connection.db)
	console.log('MongoDB connected successfully')
	return mongoose.connection
}

module.exports = connectDB
