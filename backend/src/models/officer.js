const mongoose = require('mongoose');

const officerSchema = new mongoose.Schema({
      badgeId: String,
      name: String,
      rank: String,
      status: {
        type:String,
        default: 'On Duty'
       },
      location: {
        latitude: Number,
        longitude: Number,
      }
    },{collection:
        'Personnel'});

module.exports = mongoose.model('Officer', officerSchema);
