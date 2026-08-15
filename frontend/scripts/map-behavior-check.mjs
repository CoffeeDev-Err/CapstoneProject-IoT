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
const reportMapSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'components', 'ReportLocationMap.jsx'),
  'utf8',
)
const mapControlsSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'components', 'MapStyleControls.jsx'),
  'utf8',
)
const mapLayersSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'utils', 'mapLibreLayers.js'),
  'utf8',
)
const mapConfigSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'services', 'mapTilerWeb.js'),
  'utf8',
)
const mapLibreSetupSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'services', 'configureMapLibre.js'),
  'utf8',
)
const mapNavigationSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'utils', 'mapNavigation.js'),
  'utf8',
)
const darkThemeSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'styles', 'dark-theme.css'),
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

assert.ok(packageJson.dependencies['maplibre-gl'], 'MapLibre GL JS dependency is required')
assert.ok(packageJson.dependencies.supercluster, 'MapLibre personnel clustering dependency is required')
assert.equal(packageJson.dependencies.leaflet, undefined, 'Leaflet must be removed after the MapLibre migration')
assert.match(personnelMapSource, /new maplibregl\.Map\(/, 'Personnel map must use MapLibre GL JS')
assert.match(reportMapSource, /new maplibregl\.Map\(/, 'Report route map must use MapLibre GL JS')
assert.match(personnelMapSource, /new Supercluster\(/, 'Personnel map must create a Supercluster index')
assert.match(personnelMapSource, /PERSONNEL_CLUSTER_MAX_ZOOM = 17/, 'Zoom 18 must reveal individual markers')
assert.match(personnelMapSource, /PERSONNEL_CLUSTER_RADIUS = 56/, 'Cluster radius configuration must remain enabled')
assert.match(personnelMapSource, /STREET_FOCUS_ZOOM = 16/, 'Following must preserve street-map context')
assert.match(personnelMapSource, /SATELLITE_FOCUS_ZOOM = 15/, 'Following must not over-zoom satellite imagery')
assert.match(personnelMapSource, /member\.id === followedPersonnelId/, 'The map must follow only the selected officer')
assert.match(personnelMapSource, /classList\.contains\('is-followed'\)/, 'The followed officer must remain visible outside clusters')
assert.match(personnelMapSource, /cancelAnimationFrame/, 'Superseded marker animations must be cancelled')
assert.match(mapControlsSource, /Use street map/, 'Street map control must remain available')
assert.match(mapControlsSource, /Use satellite map/, 'Satellite map control must remain available')
assert.match(mapControlsSource, /Enable 3D terrain/, '3D terrain control must remain available')
assert.match(mapConfigSource, /streets-v4-dark/, 'Dark street style must remain configured')
assert.match(mapConfigSource, /hybrid-v4-dark/, 'Dark satellite style must remain configured')
assert.match(
  mapLibreSetupSource,
  /maplibre-gl-worker\.mjs\?worker&url/,
  'Vite must bundle the MapLibre v6 worker so vector and GeoJSON layers render',
)
assert.match(personnelMapSource, /diff: false/, 'Personnel style swaps must fully reload operational layers')
assert.match(reportMapSource, /diff: false/, 'Report style swaps must fully reload route layers')
assert.match(
  reportMapSource,
  /mapCenterLatitude, mapCenterLongitude/,
  'Route data updates must not remount the map through an unstable coordinate array',
)
assert.match(
  reportMapSource,
  /getMapTilerWebStyleUrl\(currentMapMode, currentIsDark\)/,
  'A recreated route map must preserve its selected map style and theme',
)
assert.match(mapNavigationSource, /dragRotate\.enable/, 'Desktop drag rotation must be enabled')
assert.match(mapNavigationSource, /touchZoomRotate\.enableRotation/, 'Touch rotation must be enabled')
assert.match(mapNavigationSource, /is-facing-north/, 'Compass must hide when the map faces north like mobile')
assert.match(darkThemeSource, /report-location-map__canvas/, 'Route map canvas must support dark mode')
assert.match(darkThemeSource, /maplibregl-ctrl-group/, 'Native map controls must support dark mode')
assert.match(darkThemeSource, /maptiler-credit/, 'Map attribution must remain readable in dark mode')
assert.match(darkThemeSource, /personnel-table thead/, 'Personnel table header must support dark mode')
assert.match(mapLayersSource, /setTerrain/, '3D terrain must be applied through MapLibre')
assert.match(mapLayersSource, /fill-extrusion/, '3D building extrusion must remain configured')

process.stdout.write('Web MapLibre checks passed: 700ms marker interpolation, clustering, Map/Satellite styles, dark theme, 3D terrain/buildings, and report-route rendering.\n')
