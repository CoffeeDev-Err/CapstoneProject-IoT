import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const darkThemeSource = readFileSync(
  new URL('../src/styles/dark-theme.css', import.meta.url),
  'utf8',
)

for (const selector of [
  '.confirm-modal',
  '.auth-modal',
  '.profile-modal',
  '.report-detail-drawer',
]) {
  assert.ok(
    darkThemeSource.includes(`[data-theme="dark"] ${selector}`),
    `Missing dark-theme coverage for ${selector}`,
  )
}

console.log('Web dark-theme modal coverage checks passed.')
