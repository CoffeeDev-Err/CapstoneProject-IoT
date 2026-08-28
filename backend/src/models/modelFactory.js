const mongoose = require('mongoose')

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema)

module.exports = model
