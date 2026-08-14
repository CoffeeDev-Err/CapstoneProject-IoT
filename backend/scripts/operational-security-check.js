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
	EMAIL_DELIVERY_MODE: 'gmail',
	GMAIL_USER: 'alerts@example.gov.ph',
	GMAIL_APP_PASSWORD: 'application-password',
}), { isProduction: true })

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

console.log('Backend operational security checks passed.')
