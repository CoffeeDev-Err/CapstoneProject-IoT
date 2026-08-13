const cors = require('cors')
const express = require('express')
const { corsOptions } = require('./config/cors')
const { uploadRoot } = require('./config/uploads')
const securityHeaders = require('./middleware/securityHeaders')

const app = express()
const configuredTrustProxy = String(process.env.TRUST_PROXY || '').trim()
const trustProxy = configuredTrustProxy === 'true'
	? true
	: (Number.isInteger(Number(configuredTrustProxy))
		? Number(configuredTrustProxy)
		: false)

app.disable('x-powered-by')
app.set('trust proxy', trustProxy)
app.use(securityHeaders)
app.use(cors(corsOptions))
app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: false, limit: '64kb' }))
app.use('/uploads', express.static(uploadRoot, {
	dotfiles: 'deny',
	fallthrough: false,
	index: false,
	maxAge: '1h',
}))

module.exports = app
