const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const verificationCodeSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'components', 'VerificationCodeInput.tsx'),
	'utf8',
)
const loginSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'LoginScreen.tsx'),
	'utf8',
)
const authValidationSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'utils', 'authValidation.ts'),
	'utf8',
)
const authContextSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'context', 'AuthContext.tsx'),
	'utf8',
)
const operationalContextSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'context', 'OperationalContext.tsx'),
	'utf8',
) + '\n' + fs.readFileSync(
	path.join(projectRoot, 'src', 'features', 'operations', 'useOperationalSocket.ts'),
	'utf8',
)
const accountServiceSource = fs.readFileSync(
	path.join(projectRoot, '..', 'backend', 'src', 'services', 'accountService.js'),
	'utf8',
)
const webTokenStorageSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'services', 'authTokenStorage.web.ts'),
	'utf8',
)

assert.match(verificationCodeSource, /onPress=\{\(\) => focusDigit\(index\)\}/)
assert.match(verificationCodeSource, /end:\s*normalizedValue\[index\]\s*\?\s*start \+ 1\s*:\s*start/)
assert.match(verificationCodeSource, /selection=\{selection\}/)
assert.match(loginSource, /handleVerificationCodeChange/)
assert.match(loginSource, /if \(error\) setError\(''\)/)
assert.ok(authValidationSource.includes('export const LOGIN_ID_PATTERN = /^\\d{2}-\\d{4}$/;'),
	'Mobile Login IDs must use exactly NN-NNNN')
assert.match(loginSource, /validateLoginIdInput\(loginId\)/,
	'Mobile sign-in must validate the Login ID before contacting the backend')
assert.match(loginSource, /validateRecoveryIdentifier\(identifier\)/,
	'Mobile password recovery must validate its identifier before requesting OTP')
assert.match(loginSource, /error=\{fieldErrors\.loginId\}/,
	'Mobile Login ID validation must render beside the Login ID field')
assert.match(loginSource, /error=\{fieldErrors\.identifier\}/,
	'Mobile recovery errors must render beside the recovery identifier field')
assert.match(loginSource, /requestError instanceof AuthApiError[\s\S]*ACCOUNT_NOT_FOUND[\s\S]*setFieldErrors\(\{ identifier:/,
	'A nonexistent recovery account must render as an identifier field error')
assert.doesNotMatch(authContextSource, /expo-secure-store/)
assert.match(authContextSource, /mobileNumber: identity\.mobileNumber \?\? current\.profile\.mobileNumber/,
	'The signed-in officer phone number must update without requiring a new login')
assert.match(operationalContextSource, /applyIdentityUpdate\(payload\)/,
	'The private identity socket event must update the mobile auth profile')
assert.match(accountServiceSource, /mobileNumber: profile\.mobileNumber[\s\S]*officialEmail: user\.email/,
	'Account edits must include current private identity fields in the targeted officer event')
assert.doesNotMatch(accountServiceSource, /io\.emit\('personnel:identity-updated'/,
	'Private identity changes must never be broadcast to every socket')
assert.match(operationalContextSource, /operationsSocket\.on\('task:removed', onTaskRemoved\)/,
	'Terminal backup requests must disappear immediately for non-participant officers')
assert.match(operationalContextSource, /accountStatus\?\.toLowerCase\(\) === 'inactive'[\s\S]*clearSession\(\)/,
	'A deactivated officer session must close immediately after the targeted identity event')
assert.match(operationalContextSource, /refreshAuthorizedOperations[\s\S]*operationsPayload\.tasks/,
	'Deployment visibility changes must reconcile the officer authorized active tasks')
assert.match(operationalContextSource, /operationsSocket\.on\('report:updated', onReportUpdated\)/,
	'Supervisor report validation changes must update the submitting officer in realtime')
assert.match(accountServiceSource, /deactivateAccount[\s\S]*broadcastAccountData\(\{[\s\S]*accountStatus: user\.status/,
	'Deactivation must target the affected officer even after removal from the active personnel roster')
assert.match(webTokenStorageSource, /window\.sessionStorage/)
assert.doesNotMatch(webTokenStorageSource, /expo-secure-store/)

console.log('Mobile authentication interaction checks passed.')
