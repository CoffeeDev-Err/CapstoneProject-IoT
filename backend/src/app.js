const cors = require('cors')
const express = require('express')
const { corsOptions } = require('./config/cors')
const { uploadRoot } = require('./config/uploads')
const createSystemController = require('./controllers/systemController')
const createSystemRoutes = require('./routes/systemRoutes')
const flespiService = require('./services/flespiService')

const app = express()

app.disable('x-powered-by')
app.use(cors(corsOptions))
app.use(express.json())
app.use('/uploads', express.static(uploadRoot, {
	dotfiles: 'deny',
	fallthrough: false,
	index: false,
	maxAge: '1h',
}))

const systemController = createSystemController(flespiService)
app.use('/api', createSystemRoutes(systemController))

module.exports = app
