import assert from 'node:assert/strict'
import {
  normalizeMobileNumber,
  validateBadgeNumber,
  validateFullName,
  validateLoginId,
  validateMobileNumber,
  validateOfficialEmail,
  validateRank,
} from '../src/utils/accountValidation.js'

assert.equal(validateFullName('Leo B. Gannad'), '')
assert.match(validateFullName('Leo123'), /letters/)
assert.match(validateFullName('<script>alert(1)</script>'), /letters/)
assert.equal(validateBadgeNumber('P-1001'), '')
assert.match(validateBadgeNumber('P 1001'), /letters, numbers/)
assert.equal(validateLoginId('123456', { accountType: 'officer' }), '')
assert.match(validateLoginId('leo.gannad', { accountType: 'officer' }), /digits only/)
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

console.log('Web account validation checks passed.')
