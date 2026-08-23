const assert = require('assert/strict')
const {
	normalizeMobileNumber,
	validateBadgeNumber,
	validateFullName,
	validateLoginId,
	validateMobileNumber,
	validateOfficialEmail,
	validateRank,
} = require('../src/utils/accountValidation')
const { isStrongPassword } = require('../src/utils/password')
const { isValidCoordinates } = require('../src/utils/geo')
const {
	assertAccountCanBeDeactivated,
	isProtectedAccount,
} = require('../src/utils/accountProtection')

assert.equal(validateFullName('Leo B. Gannad'), '')
assert.match(validateFullName('Leo123'), /letters/)
assert.match(validateFullName('<script>alert(1)</script>'), /letters/)
assert.equal(validateBadgeNumber('P-1001'), '')
assert.match(validateBadgeNumber('P 1001'), /letters, numbers/)
assert.equal(validateLoginId('01-2002', { accountType: 'officer' }), '')
assert.match(validateLoginId('012002', { accountType: 'officer' }), /NN-NNNN/)
assert.match(validateLoginId('leo.gannad', { accountType: 'officer' }), /NN-NNNN/)
assert.equal(validateLoginId('123456', {
	accountType: 'officer',
	existingLoginId: '123456',
}), '')
assert.equal(validateLoginId('leo.gannad', {
	accountType: 'officer',
	existingLoginId: 'leo.gannad',
}), '')
assert.equal(validateLoginId('supervisor', { accountType: 'supervisor' }), '')
assert.equal(validateOfficialEmail('officer@gmail.com'), '')
assert.equal(validateOfficialEmail('officer@pnp.gov.ph'), '')
assert.match(validateOfficialEmail('officergmail.com'), /complete email/)
assert.match(validateOfficialEmail('officer@gmial.com'), /gmail\.com/)
assert.equal(normalizeMobileNumber('0910 847 9412'), '09108479412')
assert.equal(validateMobileNumber('09108479412'), '')
assert.equal(validateMobileNumber('+639108479412'), '')
assert.match(validateMobileNumber('12345'), /Philippine mobile/)
assert.equal(validateRank('Police Staff Sergeant'), '')
assert.match(validateRank('Police Hacker'), /valid Philippine National Police rank/)
assert.equal(isStrongPassword('StrongPass1!'), true)
assert.equal(isStrongPassword(`${'A'.repeat(126)}a1!`), false)
assert.equal(isValidCoordinates(17.4239, 121.7681), true)
assert.equal(isValidCoordinates(91, 121.7681), false)
assert.equal(isValidCoordinates(17.4239, 181), false)
assert.equal(isProtectedAccount({ role: 'supervisor' }), true)
assert.equal(isProtectedAccount({ role: 'officer' }), false)
assert.doesNotThrow(() => assertAccountCanBeDeactivated({ role: 'officer' }))
assert.throws(
	() => assertAccountCanBeDeactivated({ role: 'supervisor' }),
	(error) => error.status === 403 && error.code === 'PROTECTED_ACCOUNT',
)

console.log('Backend account validation checks passed.')
