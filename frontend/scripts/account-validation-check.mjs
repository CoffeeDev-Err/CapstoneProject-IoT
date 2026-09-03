import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
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
assert.equal(validateLoginId('12-2004', { accountType: 'supervisor' }), '')
assert.match(validateLoginId('supervisor', { accountType: 'supervisor' }), /NN-NNNN/)
assert.equal(validateOfficialEmail('officer@gmail.com'), '')
assert.equal(validateOfficialEmail('officer@pnp.gov.ph'), '')
assert.match(validateOfficialEmail('officergmail.com'), /complete email/)
assert.match(validateOfficialEmail('officer@gmial.com'), /gmail\.com/)
assert.match(validateOfficialEmail('leo.b.gannad@isu.edu.p'), /isu\.edu\.ph/)
assert.match(validateOfficialEmail('officer@pnp'), /complete email/)
assert.equal(normalizeMobileNumber('0910 847 9412'), '09108479412')
assert.equal(validateMobileNumber('09108479412'), '')
assert.equal(validateMobileNumber('+639108479412'), '')
assert.match(validateMobileNumber('12345'), /Philippine mobile/)
assert.equal(validateRank('Police Staff Sergeant'), '')
assert.match(validateRank('Police Hacker'), /valid Philippine National Police rank/)

const projectRoot = path.resolve(import.meta.dirname, '..')
const settingsPage = fs.readFileSync(path.join(projectRoot, 'src/pages/SettingsPage.jsx'), 'utf8')
  + '\n'
  + fs.readFileSync(path.join(projectRoot, 'src/features/accounts/AccountRankPicker.jsx'), 'utf8')
  + '\n'
  + fs.readFileSync(path.join(projectRoot, 'src/features/accounts/useAccountForm.js'), 'utf8')
  + '\n'
  + fs.readFileSync(path.join(projectRoot, 'src/features/accounts/AccountTable.jsx'), 'utf8')
  + '\n'
  + fs.readFileSync(path.join(projectRoot, 'src/features/accounts/AccountGpsSelector.jsx'), 'utf8')
  + '\n'
  + fs.readFileSync(path.join(projectRoot, 'src/features/accounts/AccountDialogs.jsx'), 'utf8')
const settingsStyles = fs.readFileSync(path.join(projectRoot, 'src/styles/settings.css'), 'utf8')
const topBar = fs.readFileSync(path.join(projectRoot, 'src/components/TopBar.jsx'), 'utf8')
assert.match(settingsPage, /className="account-rank-options" role="listbox"/,
  'The long police-rank list must use an in-app scrollable dropdown')
assert.match(settingsPage, /matchesPrefixSearch\(search, \[rank\]\)/,
  'The rank dropdown search must use prefix matching')
assert.match(settingsPage, /spaceBelow[\s\S]*spaceAbove[\s\S]*placement/,
  'The rank dropdown must choose a viewport-safe opening direction')
assert.match(settingsStyles, /\.account-rank-dropdown\s*\{[\s\S]*?position:\s*absolute[\s\S]*?max-height:\s*var\(--account-rank-max-height/,
  'The rank dropdown must overlay without changing the surrounding form grid')
assert.match(settingsStyles, /\.account-rank-options\s*\{[\s\S]*?overflow-y:\s*auto/,
  'The rank list must scroll inside its bounded dropdown')
assert.match(settingsPage, /account\.isProtected \|\| account\.role === 'Supervisor'[\s\S]*Protected/,
  'COP/admin accounts must not expose a deactivate action')
assert.match(topBar, /user\?\.fullName[\s\S]*user\?\.username/,
  'The top-bar identity must come from the authenticated account')
assert.doesNotMatch(topBar, /Sgt\. Leo Gannad|name=Leo\+Gannad/,
  'The top bar must not contain a hardcoded person')

console.log('Web account validation checks passed.')
