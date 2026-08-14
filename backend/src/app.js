const cors = require('cors')
const express = require('express')
const { corsOptions } = require('./config/cors')
const { parseTrustProxy } = require('./config/environment')
const securityHeaders = require('./middleware/securityHeaders')

const app = express()
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY)

app.disable('x-powered-by')
app.set('trust proxy', trustProxy)
app.use(securityHeaders)
app.use(cors(corsOptions))
app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: false, limit: '64kb' }))
module.exports = app
