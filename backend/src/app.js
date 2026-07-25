const cors = require('cors')
const express = require('express')
const createSystemController = require('./controllers/systemController')
const createSystemRoutes = require('./routes/systemRoutes')
const flespiService = require('./services/flespiService')

const app = express()

app.use(cors())
app.use(express.json())

const systemController = createSystemController(flespiService)
app.use('/api', createSystemRoutes(systemController))

module.exports = app
