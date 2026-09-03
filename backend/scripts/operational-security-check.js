const assert = require('assert/strict')
const {
	parseTrustProxy,
	validateProductionEnvironment,
} = require('../src/config/environment')
const securityHeaders = require('../src/middleware/securityHeaders')
const {
	toMediaAccessPath,
	verifyMediaAccess,
} = require('../src/services/mediaStorageService')
const {
	canOfficerReadTask,
	taskParticipantIds,
} = require('../src/services/operationalService')
const { scopePersonnelForActor } = require('../src/services/personnelService')
const { distanceInMeters } = require('../src/utils/geo')
const {
	validateOptionalNumber,
	validateReportType,
	validateText,
} = require('../src/utils/operationalValidation')

assert.equal(validateReportType('INCIDENT'), 'incident')
assert.throws(() => validateReportType('fake-type'), /must be one of/)
assert.throws(() => validateReportType(['incident']), /must be text/)
assert.equal(validateText('  Valid report  ', {
	field: 'title', label: 'Title', maxLength: 20,
}), 'Valid report')
assert.throws(() => validateText({ text: 'not scalar' }, {
	field: 'title', label: 'Title', maxLength: 20,
}), /must be text/)
assert.throws(() => validateText('bad\u0000text', {
	field: 'title', label: 'Title', maxLength: 20,
}), /unsupported characters/)
assert.equal(validateOptionalNumber('100', {
	field: 'battery', label: 'Battery', min: 0, max: 100,
}), 100)
assert.throws(() => validateOptionalNumber(true, {
	field: 'battery', label: 'Battery', min: 0, max: 100,
}), /between 0 and 100/)

assert.ok(distanceInMeters([121.7681, 17.4239], [121.7681, 17.4239]) < 0.01)
assert.ok(distanceInMeters([121.7681, 17.4239], [121.7691, 17.4239]) > 100)

const activeTask = {
	requestedBy: 'officer-001',
	responders: [{ personnelId: 'officer-002' }],
	status: 'open',
}
const completedTask = { ...activeTask, status: 'completed' }
assert.deepEqual(taskParticipantIds(activeTask), ['officer-001', 'officer-002'])
assert.equal(canOfficerReadTask(activeTask, 'officer-003', true), true)
assert.equal(canOfficerReadTask(activeTask, 'officer-003', false), false)
assert.equal(canOfficerReadTask(completedTask, 'officer-002', false), true)
assert.equal(canOfficerReadTask(completedTask, 'officer-003', true), false)

const personnel = [
	{ id: 'officer-001', isOnDuty: false, mobileNumber: '09170000001' },
	{ id: 'officer-002', isOnDuty: true, mobileNumber: '09170000002' },
	{ id: 'officer-003', isOnDuty: false, mobileNumber: '09170000003' },
]
const officerRoster = scopePersonnelForActor(personnel, {
	role: 'officer', personnelId: 'officer-001',
})
assert.deepEqual(officerRoster.map((member) => member.id), ['officer-001', 'officer-002'])
assert.equal('mobileNumber' in officerRoster[0], false)
assert.equal(scopePersonnelForActor(personnel, { role: 'supervisor' }).length, 3)

const previousMediaSigningSecret = process.env.MEDIA_URL_SIGNING_SECRET
process.env.MEDIA_URL_SIGNING_SECRET = 'c'.repeat(32)
const localMediaUrl = new URL(
	toMediaAccessPath('/uploads/report-evidence/evidence.jpg'),
	'https://app.example.gov.ph',
)
const verifiedLocalMedia = verifyMediaAccess({
	token: localMediaUrl.pathname.split('/').at(-1),
	expires: localMediaUrl.searchParams.get('expires'),
	signature: localMediaUrl.searchParams.get('signature'),
})
if (previousMediaSigningSecret === undefined) delete process.env.MEDIA_URL_SIGNING_SECRET
else process.env.MEDIA_URL_SIGNING_SECRET = previousMediaSigningSecret
assert.equal(verifiedLocalMedia.storage, 'local')
assert.equal(verifiedLocalMedia.key, 'report-evidence/evidence.jpg')

assert.equal(parseTrustProxy('1'), 1)
assert.equal(parseTrustProxy('true'), true)
assert.equal(parseTrustProxy('invalid'), false)
assert.throws(() => validateProductionEnvironment({ NODE_ENV: 'production' }), {
	code: 'UNSAFE_PRODUCTION_CONFIGURATION',
})
assert.deepEqual(validateProductionEnvironment({
	NODE_ENV: 'production',
	MONGO_URI: 'mongodb+srv://user:password@cluster.example/database',
	ALLOWED_ORIGINS: 'https://app.example.gov.ph',
	TRUST_PROXY: '1',
	OTP_SECRET: 'a'.repeat(32),
	GPS_INGEST_API_KEY: 'b'.repeat(32),
	MEDIA_URL_SIGNING_SECRET: 'd'.repeat(32),
	EMAIL_DELIVERY_MODE: 'gmail',
	GMAIL_USER: 'alerts@example.gov.ph',
	GMAIL_APP_PASSWORD: 'application-password',
}), { isProduction: true })

// --- Rate limiting must stay bounded and must not exempt unidentified callers ---
// A request with no resolvable address (misconfigured trusted-proxy depth) must
// still be counted rather than sailing past the limiter unlimited.
{
	const createRateLimit = require('../src/middleware/rateLimit')
	const limiter = createRateLimit({ windowMs: 60_000, max: 2, keyPrefix: 'anonymous-test' })
	const run = (req) => {
		let statusCode = 200
		let nextCalled = false
		const res = {
			set() {},
			status(code) { statusCode = code; return res },
			json() { return res },
		}
		limiter(req, res, () => { nextCalled = true })
		return { statusCode, nextCalled }
	}

	assert.equal(run({}).nextCalled, true)
	assert.equal(run({}).nextCalled, true)
	const blocked = run({})
	assert.equal(blocked.nextCalled, false, 'Unidentified callers must still be rate limited')
	assert.equal(blocked.statusCode, 429)

	// A distinct address must not inherit the exhausted anonymous bucket.
	assert.equal(run({ ip: '203.0.113.55' }).nextCalled, true)
}

// Account-specific limits must not make different officers on one station IP
// consume each other's small password allowance. Successful requests are not
// retained as failures, and OTP challenges use an independent namespace.
{
	const createRateLimit = require('../src/middleware/rateLimit')
	const createResponse = () => {
		const listeners = new Map()
		return {
			statusCode: 200,
			set() {},
			status(code) { this.statusCode = code; return this },
			json() { return this },
			once(event, listener) { listeners.set(event, listener) },
			finish() { listeners.get('finish')?.() },
		}
	}
	const run = (limiter, req, finalStatus = 401) => {
		const res = createResponse()
		let nextCalled = false
		limiter(req, res, () => { nextCalled = true })
		if (nextCalled) res.statusCode = finalStatus
		res.finish()
		return { statusCode: res.statusCode, nextCalled }
	}
	const passwordLimiter = createRateLimit({
		windowMs: 60_000,
		max: 2,
		keyPrefix: 'password-account-test',
		keyGenerator: (req) => String(req.body?.username || '').trim().toLowerCase(),
		skipSuccessfulRequests: true,
	})
	const stationIp = '203.0.113.10'

	assert.equal(run(passwordLimiter, { ip: stationIp, body: { username: '01-2002' } }).nextCalled, true)
	assert.equal(run(passwordLimiter, { ip: stationIp, body: { username: '01-2002' } }).nextCalled, true)
	assert.equal(run(passwordLimiter, { ip: stationIp, body: { username: '01-2002' } }).statusCode, 429)
	assert.equal(
		run(passwordLimiter, { ip: stationIp, body: { username: '02-2002' } }).nextCalled,
		true,
		'A different officer on the same IP must retain an independent allowance',
	)

	assert.equal(run(passwordLimiter, {
		ip: stationIp,
		body: { username: '03-2002' },
	}, 200).nextCalled, true)
	assert.equal(run(passwordLimiter, {
		ip: stationIp,
		body: { username: '03-2002' },
	}, 200).nextCalled, true)
	assert.equal(run(passwordLimiter, {
		ip: stationIp,
		body: { username: '03-2002' },
	}, 200).nextCalled, true, 'Successful sign-ins must not exhaust the failure allowance')

	const otpLimiter = createRateLimit({
		windowMs: 60_000,
		max: 1,
		keyPrefix: 'otp-challenge-test',
		keyGenerator: (req) => req.body?.challenge_id,
	})
	assert.equal(run(otpLimiter, { ip: stationIp, body: { challenge_id: 'challenge-a' } }).nextCalled, true)
	assert.equal(run(otpLimiter, { ip: stationIp, body: { challenge_id: 'challenge-a' } }).statusCode, 429)
	assert.equal(run(otpLimiter, { ip: stationIp, body: { challenge_id: 'challenge-b' } }).nextCalled, true)
}

{
	const fs = require('fs')
	const path = require('path')
	const routeSource = fs.readFileSync(
		path.join(__dirname, '..', 'src', 'routes', 'authRoutes.js'),
		'utf8',
	)
	assert.match(routeSource, /auth-password-account/)
	assert.match(routeSource, /auth-otp-challenge/)
	assert.match(routeSource, /router\.post\(\s*'\/login',[\s\S]*limitPasswordByAccount/)
	assert.match(routeSource, /router\.post\(\s*'\/login\/verify',[\s\S]*limitOtpByChallenge/)
}

// --- The mock-officer account must never fall back to a committed password ---
{
	const fs = require('fs')
	const path = require('path')
	const seedSource = fs.readFileSync(
		path.join(__dirname, '..', 'src', 'services', 'seedService.js'),
		'utf8',
	)
	assert.doesNotMatch(
		seedSource,
		/MOCK_OFFICER_TEMP_PASSWORD\s*\|\|\s*'[^']+'/,
		'A committed default would be a publicly known credential for a loginable account',
	)
	assert.match(
		seedSource,
		/MOCK_OFFICER_TEMP_PASSWORD is required when ENABLE_MOCK_OFFICER=true/,
		'Enabling the mock officer without a supplied password must fail loudly',
	)
}

// --- No client-shaped value may reach a Mongo query uncoerced ---
// Path params are always strings, but `req.query` and `req.body` can be objects
// or arrays (`?x[$ne]=1`, a crafted JSON body), which is how NoSQL operator
// injection happens. Every call site today coerces with String()/Number() first;
// this guard fails the build if a future edit hands one straight to a query.
{
	const fs = require('fs')
	const path = require('path')
	const sourceRoot = path.join(__dirname, '..', 'src')
	const mongoCallWithRawInput = new RegExp(
		'\\.(find|findOne|findById|findOneAndUpdate|findOneAndDelete|updateOne|updateMany'
		+ '|deleteOne|deleteMany|countDocuments|aggregate|distinct)\\('
		+ '[^;]{0,200}?req\\.(query|body)\\b',
		's',
	)

	const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = path.join(directory, entry.name)
			if (entry.isDirectory()) return walk(entryPath)
			return entry.name.endsWith('.js') ? [entryPath] : []
		})

	const offenders = walk(sourceRoot).filter((filePath) => (
		mongoCallWithRawInput.test(fs.readFileSync(filePath, 'utf8'))
	))
	assert.deepEqual(
		offenders.map((filePath) => path.relative(sourceRoot, filePath)),
		[],
		'Coerce req.query/req.body values before using them in a Mongo query',
	)
}

const previousNodeEnvironment = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
const headers = {}
securityHeaders(
	{ path: '/api/health' },
	{
		set(nameOrHeaders, value) {
			if (typeof nameOrHeaders === 'string') headers[nameOrHeaders] = value
			else Object.assign(headers, nameOrHeaders)
		},
	},
	() => {},
)
if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV
else process.env.NODE_ENV = previousNodeEnvironment
assert.match(headers['Content-Security-Policy'], /default-src 'self'/)
assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains')
assert.equal(headers['Cache-Control'], 'no-store')

// --- Password reset must reject unknown accounts before OTP (product requirement) ---
// The client must never receive a synthetic challenge that advances an unknown Login ID
// or email to the verification-code screen. Route-level throttling still limits probing.
;(async () => {
	const authService = require('../src/services/authService')
	const models = require('../src/models')
	const originalFindOne = models.User.findOne

	try {
		await assert.rejects(
			() => authService.login({ username: 'admin', password: 'StrongPass1!' }),
			(error) => error.status === 400 && error.code === 'INVALID_LOGIN_ID_FORMAT',
		)
		models.User.findOne = async () => null
		await assert.rejects(
			() => authService.requestPasswordReset(
				{ identifier: 'ghost@cabagan.gov.ph' },
				{ requestIp: '203.0.113.10' },
			),
			(error) => error.status === 404 && error.code === 'ACCOUNT_NOT_FOUND',
		)
		await assert.rejects(
			() => authService.requestPasswordReset(
				{ identifier: '99-9999' },
				{ requestIp: '203.0.113.10' },
			),
			(error) => error.status === 404 && error.code === 'ACCOUNT_NOT_FOUND',
		)
		await assert.rejects(
			() => authService.requestPasswordReset(
				{ identifier: 'letters-are-not-a-login-id' },
				{ requestIp: '203.0.113.10' },
			),
			(error) => error.status === 400 && error.code === 'INVALID_LOGIN_ID_FORMAT',
		)
	} finally {
		models.User.findOne = originalFindOne
	}

	// --- Supervisor notification endpoints must ignore a client recipient id ---
	// Otherwise a supervisor could read, mark, or delete any individual officer's
	// notifications by passing that officer's personnel id.
	{
		const createNotificationController = require('../src/controllers/notificationController')
		const requested = []
		const controller = createNotificationController({
			getNotifications: async (recipientId) => { requested.push(recipientId); return [] },
			markNotificationRead: async (_id, recipientId) => {
				requested.push(recipientId)
				return { _id: 'notification-1' }
			},
			markAllNotificationsRead: async (recipientId) => { requested.push(recipientId); return 0 },
			deleteNotifications: async (recipientId) => { requested.push(recipientId); return 0 },
		})
		const res = { json() { return res }, status() { return res } }
		const hostile = 'pcpl-001'

		await controller.getNotifications({ query: { recipient_id: hostile } }, res)
		await controller.markAllRead({ body: { recipient_id: hostile } }, res)
		await controller.clearNotifications({ query: { recipient_id: hostile } }, res)
		await controller.markRead(
			{ params: { notificationId: 'notification-1' }, query: { recipient_id: hostile }, body: {} },
			res,
		)

		assert.equal(requested.length, 4)
		assert.deepEqual(
			[...new Set(requested)],
			['supervisor'],
			'Supervisor notification endpoints must always scope to the supervisor stream',
		)
	}

	// --- Reading a report route must not mutate the report ---
	// The durable snapshot is persisted at submission and finalized by the
	// lifecycle tick; a GET that writes would let prefetching clients mutate data
	// and would make captured_at mean "last viewed".
	{
		const createOperationalService = require('../src/services/operationalService')
		const models = require('../src/models')
		const originalReportFindOne = models.Report.findOne
		const originalHistoryFind = models.LocationHistory.find

		try {
			const incidentAt = new Date('2026-08-19T02:00:00.000Z')
			const capturedAt = new Date('2026-08-19T02:20:00.000Z')
			models.Report.findOne = () => ({
				lean: async () => ({
					reportNumber: 'RPT-0001',
					submittedBy: 'pcpl-001',
					incidentAt,
					routeSnapshotCapturedAt: capturedAt,
					routeSnapshot: [{
						location: { type: 'Point', coordinates: [121.7681, 17.4239] },
						recordedAt: incidentAt,
						source: 'gps',
					}],
					// A reintroduced write would call this and fail the check.
					save: async () => { throw new Error('GET /reports/:id/route must not write') },
				}),
			})
			models.LocationHistory.find = () => ({
				sort: () => ({ lean: async () => [] }),
			})

			const service = createOperationalService({ io: null })
			const route = await service.getReportRoute('RPT-0001')
			assert.equal(route.report_id, 'RPT-0001')
			assert.equal(route.points.length, 1)
			assert.equal(
				route.captured_at,
				capturedAt.toISOString(),
				'captured_at must report the persisted capture, not the time of the read',
			)
		} finally {
			models.Report.findOne = originalReportFindOne
			models.LocationHistory.find = originalHistoryFind
		}
	}

	console.log('Backend operational security checks passed.')
})().catch((error) => {
	console.error(error)
	process.exit(1)
})
