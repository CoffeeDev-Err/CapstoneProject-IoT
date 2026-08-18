import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  'utf8',
)

const routesSource = readSource('src/routes/AppRoutes.jsx')
const drawerSource = readSource('src/components/ReportDetailDrawer.jsx')
const viewerSource = readSource('src/pages/EvidenceViewerPage.jsx')
const operationsSource = readSource('src/services/operations.js')
const indexSource = readSource('index.html')

assert.match(routesSource, /path="\/reports\/:reportId\/evidence"/)
assert.match(drawerSource, /getEvidenceViewerPath\(report\.id\)/)
assert.match(drawerSource, /Open evidence viewer/)
assert.match(viewerSource, /getReport\(reportId\)/)
assert.match(viewerSource, /getMediaDownloadUrl\(evidence\?\.url\)/)
assert.match(operationsSource, /\/api\/reports\/\$\{encodeURIComponent\(reportId\)\}/)
assert.match(indexSource, /geosentri-icon\.png/)
assert.doesNotMatch(indexSource, /vite\.svg/)

console.log('Protected evidence viewer checks passed.')
