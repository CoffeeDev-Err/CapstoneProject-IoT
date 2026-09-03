import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const routes = fs.readFileSync(path.join(projectRoot, 'src/routes/AppRoutes.jsx'), 'utf8')
const guestOnlyRoute = fs.readFileSync(path.join(projectRoot, 'src/components/GuestOnlyRoute.jsx'), 'utf8')
const protectedRoute = fs.readFileSync(path.join(projectRoot, 'src/components/ProtectedRoute.jsx'), 'utf8')
const authStyles = fs.readFileSync(path.join(projectRoot, 'src/styles/auth.css'), 'utf8')
const loginPage = fs.readFileSync(path.join(projectRoot, 'src/pages/LoginPage.jsx'), 'utf8')

assert.match(routes, /<Route element={<GuestOnlyRoute \/>}>[\s\S]*path="\/login"/,
  'The login page must be restricted to unauthenticated visitors')
assert.match(guestOnlyRoute, /isAuthenticated[\s\S]*<Navigate to="\/" replace \/>/,
  'An authenticated visitor must be redirected away from login')
assert.match(protectedRoute, /!isAuthenticated[\s\S]*<Navigate to="\/login" replace/,
  'Protected pages must redirect unauthenticated visitors to login')
assert.match(authStyles, /\.login-submit-btn:disabled\s*\{[\s\S]*background:\s*#[0-9a-f]+[\s\S]*opacity:\s*1/,
  'Disabled login actions must retain a visible button container')
assert.doesNotMatch(loginPage, /disabled=\{!accountId|disabled=\{code\.length|disabled=\{!identifier/,
  'Primary authentication actions must remain clickable when required fields are empty')
assert.match(loginPage, /Login ID is required\.[\s\S]*Password is required\./,
  'Clicking Sign In with empty fields must produce field-level required messages')
assert.match(loginPage, /LOGIN_ID_PATTERN\.test\(accountId\.trim\(\)\)/,
  'Web sign-in must reject Login IDs outside the NN-NNNN format')
assert.match(loginPage, /getRecoveryIdentifierError\(identifier\)/,
  'Web password recovery must validate a Login ID or official email before requesting OTP')
assert.match(loginPage, /setFieldErrors\(\{ code: COMPLETE_CODE_MESSAGE \}\)/,
  'Clicking Verify with an incomplete code must explain the missing requirement')
assert.match(authStyles, /\.login-field-error\s*\{/,
  'Authentication field errors must be visually associated with their inputs')

console.log('Web authentication route checks passed.')
