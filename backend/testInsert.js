require('dotenv').config();
const mongoose = require('mongoose');
const Officer = require('./src/models/officer');


mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected successfully');
    // Create a new officer document
    const tesdata = new Officer({
      badgeId: 'P-2024-001',
      name: 'John Doe',
      rank: 'Police Sergeant',
      status: 'On Duty',
      location: {
        latitude: 17.4300,
        longitude: 121.7700,
      },
    });
    await tesdata.save();
    console.log('Officer data inserted successfully');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });