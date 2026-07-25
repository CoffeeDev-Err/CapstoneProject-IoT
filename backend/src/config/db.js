const mongoose = require('mongoose')
require('dotenv').config()

const connectDB = async () => {
	if (!process.env.MONGO_URI) {
		throw new Error('MONGO_URI is required. The API cannot start without persistent storage.')
	}

	await mongoose.connect(process.env.MONGO_URI, {
		serverSelectionTimeoutMS: 10_000,
	})
	console.log('MongoDB connected successfully')
	return mongoose.connection
}

module.exports = connectDB
