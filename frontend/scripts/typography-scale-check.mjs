import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const stylesRoot = path.join(projectRoot, 'src', 'styles')
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

const tokens = read('src/styles/tokens.css')
const shell = read('src/styles/shell.css')
const index = read('src/index.css')

assert.match(tokens, /--font-size-xs:\s*0\.75rem;/)
assert.match(tokens, /--font-size-sm:\s*0\.875rem;/)
assert.match(tokens, /--font-size-base:\s*1rem;/)
assert.match(tokens, /--font-size-lg:\s*1\.125rem;/)
assert.match(tokens, /--font-size-xl:\s*1\.25rem;/)
assert.match(tokens, /--font-size-2xl:\s*1\.5rem;/)
assert.match(tokens, /--font-size-3xl:\s*2rem;/)
assert.match(tokens, /html\s*\{[\s\S]*font-size:\s*100%;/,
  'The root size must respect the browser/user default instead of forcing 14px')
assert.match(index, /body\s*\{[\s\S]*font-size:\s*var\(--font-size-sm, 0\.875rem\)/,
  'Dense desktop application text must use the compact 14px token')
assert.match(index, /@media \(max-width: 767px\)[\s\S]*font-size:\s*var\(--font-size-base\) !important/,
  'Mobile form controls must remain 16px to prevent automatic input zoom')
assert.match(shell, /\.nav-sidebar__section-title\s*\{[\s\S]*?font-size:\s*var\(--font-size-xs\)/,
  'Sidebar section headings must use the 12px token')
assert.match(shell, /\.nav-sidebar__link\s*\{[\s\S]*?font-size:\s*var\(--font-size-sm\)/,
  'Sidebar navigation labels must use the 14px token')

const cssFiles = fs.readdirSync(stylesRoot)
  .filter((fileName) => fileName.endsWith('.css'))
  .map((fileName) => path.join(stylesRoot, fileName))
const nonStandardDeclarations = []

for (const filePath of [...cssFiles, path.join(projectRoot, 'src', 'index.css')]) {
  const source = fs.readFileSync(filePath, 'utf8')
  for (const match of source.matchAll(/(?:^|[;{]\s*)font-size:\s*([^;}]+)/gm)) {
    const value = match[1].trim()
    if (/^(?:var\(--font-size-|100%$|0$|inherit$)/.test(value)) continue
    nonStandardDeclarations.push(`${path.relative(projectRoot, filePath)}: ${value}`)
  }
}

assert.deepEqual(nonStandardDeclarations, [],
  `All explicit font sizes must use the shared type scale:\n${nonStandardDeclarations.join('\n')}`)

console.log('Web typography scale checks passed.')
