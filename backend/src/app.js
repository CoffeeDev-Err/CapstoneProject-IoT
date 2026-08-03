const cors = require('cors')
const express = require('express')
const path = require('path')
const createSystemController = require('./controllers/systemController')
const createSystemRoutes = require('./routes/systemRoutes')
const flespiService = require('./services/flespiService')

const app = express()

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), {
	dotfiles: 'deny',
	fallthrough: false,
	index: false,
	maxAge: '1h',
}))

const systemController = createSystemController(flespiService)
app.use('/api', createSystemRoutes(systemController))

module.exports = app
