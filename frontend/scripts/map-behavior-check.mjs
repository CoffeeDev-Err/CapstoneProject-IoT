import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MARKER_ANIMATION_DURATION_MS,
  easeOutCubic,
  interpolateLatLng,
} from '../src/utils/mapMotion.js'

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptsDirectory, '..')
const personnelMapSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'components', 'PersonnelMap.jsx'),
  'utf8',
)
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

assert.equal(MARKER_ANIMATION_DURATION_MS, 700, 'Web marker interpolation must remain at 700ms')
assert.equal(easeOutCubic(0), 0, 'Interpolation must begin at the old GPS position')
assert.equal(easeOutCubic(1), 1, 'Interpolation must finish at the new GPS position')
assert.equal(easeOutCubic(-1), 0, 'Interpolation progress must be clamped below zero')
assert.equal(easeOutCubic(2), 1, 'Interpolation progress must be clamped above one')
assert.deepEqual(
  interpolateLatLng([17.4, 121.7], [17.5, 121.8], 1),
  [17.5, 121.8],
  'Web animation must land on the exact GPS destination',
)

assert.ok(packageJson.dependencies['leaflet.markercluster'], 'Leaflet marker clustering dependency is required')
assert.match(personnelMapSource, /L\.markerClusterGroup\(/, 'Personnel map must create a marker cluster group')
assert.match(personnelMapSource, /disableClusteringAtZoom:\s*18/, 'Close zoom must reveal individual markers')
assert.match(personnelMapSource, /maxClusterRadius:\s*56/, 'Cluster radius configuration must remain enabled')
assert.match(personnelMapSource, /clusterGroup\.refreshClusters/, 'Status changes must refresh cluster priority colors')
assert.match(personnelMapSource, /cancelAnimationFrame/, 'Superseded marker animations must be cancelled')

process.stdout.write('Web map behavior checks passed: 700ms interpolation endpoints, cancellation guard, clustering integration, zoom separation, and priority refresh.\n')
