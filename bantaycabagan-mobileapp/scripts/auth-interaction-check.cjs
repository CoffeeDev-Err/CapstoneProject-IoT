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

assert.match(verificationCodeSource, /onPress=\{\(\) => focusDigit\(index\)\}/)
assert.match(verificationCodeSource, /end:\s*normalizedValue\[index\]\s*\?\s*start \+ 1\s*:\s*start/)
assert.match(verificationCodeSource, /selection=\{selection\}/)
assert.match(loginSource, /handleVerificationCodeChange/)
assert.match(loginSource, /if \(error\) setError\(''\)/)

console.log('Mobile authentication interaction checks passed.')
