const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.warn('MongoDB connection failed — running without database.');
    console.warn('GPS simulation and Socket.IO will still work.');
    console.warn('Start MongoDB or set MONGO_URI in .env to enable persistence.');
  }
};

module.exports = connectDB;