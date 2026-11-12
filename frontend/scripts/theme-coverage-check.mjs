import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const darkThemeSource = readFileSync(
  new URL('../src/styles/dark-theme.css', import.meta.url),
  'utf8',
)
const lightThemeSource = readFileSync(
  new URL('../src/styles/light-theme.css', import.meta.url),
  'utf8',
)

for (const selector of [
  '.confirm-modal',
  '.auth-modal',
  '.profile-modal',
  '.report-detail-drawer',
  '.evidence-viewer',
]) {
  assert.ok(
    darkThemeSource.includes(`[data-theme="dark"] ${selector}`),
    `Missing dark-theme coverage for ${selector}`,
  )
}

assert.match(lightThemeSource, /scrollbar-color:\s*var\(--scrollbar-thumb\) var\(--scrollbar-track\)/,
  'Light-mode scrollbars must follow the shared palette')
assert.match(lightThemeSource, /::-webkit-scrollbar-button[\s\S]*width:\s*0;[\s\S]*height:\s*0;/,
  'Light-mode scrollbars must remove native arrow buttons')

console.log('Web theme coverage checks passed.')
