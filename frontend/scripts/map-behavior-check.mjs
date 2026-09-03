import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GPS_UPDATE_INTERVAL_MS,
  MARKER_ANIMATION_DURATION_MS,
  VEHICLE_MARKER_ANIMATION_DURATION_MS,
  WALKING_MARKER_ANIMATION_DURATION_MS,
  calculatedSpeedKmhBetweenFixes,
  easeOutCubic,
  interpolateLatLng,
  markerMotionForFixes,
  resolveMotionSpeedKmh,
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
const mapPreviewSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'utils', 'mockMapPersonnel.js'),
  'utf8',
)
const darkThemeSource = fs.readFileSync(
  path.join(projectRoot, 'src', 'styles', 'dark-theme.css'),
  'utf8',
)
const monitoringStyles = fs.readFileSync(
  path.join(projectRoot, 'src', 'styles', 'monitoring.css'),
  'utf8',
)
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

assert.equal(GPS_UPDATE_INTERVAL_MS, 10_000, 'Web GPS cadence must match the tracker upload interval')
assert.equal(MARKER_ANIMATION_DURATION_MS, 2_000, 'Web default motion must remain a two-second slow catch-up')
assert.equal(WALKING_MARKER_ANIMATION_DURATION_MS, 2_000, 'Walking fixes must retain smooth two-second motion')
assert.equal(VEHICLE_MARKER_ANIMATION_DURATION_MS, 900, 'Vehicle fixes must catch up in under one second')
assert.equal(easeOutCubic(0), 0, 'Interpolation must begin at the old GPS position')
assert.equal(easeOutCubic(1), 1, 'Interpolation must finish at the new GPS position')
assert.equal(easeOutCubic(-1), 0, 'Interpolation progress must be clamped below zero')
assert.equal(easeOutCubic(2), 1, 'Interpolation progress must be clamped above one')
assert.deepEqual(
  interpolateLatLng([17.4, 121.7], [17.5, 121.8], 1),
  [17.5, 121.8],
  'Web animation must land on the exact GPS destination',
)

const baseFix = {
  latitude: 17.4269,
  longitude: 121.7653,
  recordedAt: '2026-08-21T00:00:00.000Z',
  speed: 0,
}
const vehicleFixWithoutSpeed = {
  latitude: 17.4278,
  longitude: 121.7653,
  recordedAt: '2026-08-21T00:00:10.000Z',
  speed: null,
}
const calculatedVehicleSpeed = calculatedSpeedKmhBetweenFixes(baseFix, vehicleFixWithoutSpeed)
assert.ok(calculatedVehicleSpeed > 30 && calculatedVehicleSpeed < 40, 'Distance/time must calculate missing vehicle speed')
assert.equal(
  markerMotionForFixes(baseFix, vehicleFixWithoutSpeed).durationMs,
  VEHICLE_MARKER_ANIMATION_DURATION_MS,
  'Missing tracker speed must still select fast vehicle catch-up',
)
assert.equal(
  resolveMotionSpeedKmh(baseFix, { ...vehicleFixWithoutSpeed, speed: 1 }),
  calculatedVehicleSpeed,
  'A noisy reported speed must fall back to confirmed distance/time speed',
)
assert.equal(
  markerMotionForFixes(baseFix, {
    ...baseFix,
    latitude: 17.42691,
    recordedAt: '2026-08-21T00:00:10.000Z',
  }).suppressJitter,
  true,
  'Stationary GPS drift within five meters must not move the marker',
)
assert.equal(
  markerMotionForFixes(baseFix, {
    ...baseFix,
    latitude: 17.4270,
    recordedAt: '2026-08-21T00:00:10.000Z',
  }).durationMs,
  WALKING_MARKER_ANIMATION_DURATION_MS,
  'Slow confirmed movement must retain the smooth walking duration',
)
assert.deepEqual(
  interpolateLatLng([17.4, 121.7], [17.5, 121.8], 0.5),
  [17.45, 121.75],
  'Web GPS interpolation must move linearly at a constant visual speed',
)

assert.ok(packageJson.dependencies['maplibre-gl'], 'MapLibre GL JS dependency is required')
assert.ok(packageJson.dependencies.supercluster, 'MapLibre personnel clustering dependency is required')
assert.equal(packageJson.dependencies.leaflet, undefined, 'Leaflet must be removed after the MapLibre migration')
assert.match(personnelMapSource, /new maplibregl\.Map\(/, 'Personnel map must use MapLibre GL JS')
assert.match(reportMapSource, /new maplibregl\.Map\(/, 'Report route map must use MapLibre GL JS')
assert.match(personnelMapSource, /new Supercluster\(/, 'Personnel map must create a Supercluster index')
assert.match(
  personnelMapSource,
  /getLeaves\(feature\.properties\.cluster_id, Infinity\)[\s\S]*memberIds\.join\('\|'\)/,
  'Web cluster markers must use stable membership keys',
)
assert.match(
  personnelMapSource,
  /state\.marker\.setLngLat\(\[nextPosition\[1\], nextPosition\[0\]\]\)/,
  'Web cluster centroids must animate between GPS fixes',
)
assert.match(personnelMapSource, /PERSONNEL_CLUSTER_MAX_ZOOM = 17/, 'Zoom 18 must reveal individual markers')
assert.match(personnelMapSource, /PERSONNEL_CLUSTER_RADIUS = 56/, 'Cluster radius configuration must remain enabled')
assert.match(personnelMapSource, /STREET_FOCUS_ZOOM = 16/, 'Following must preserve street-map context')
assert.match(personnelMapSource, /SATELLITE_FOCUS_ZOOM = 15/, 'Following must not over-zoom satellite imagery')
assert.match(personnelMapSource, /member\.id === followedPersonnelId/, 'The map must follow only the selected officer')
assert.match(personnelMapSource, /classList\.contains\('is-followed'\)/, 'The followed officer must remain visible outside clusters')
assert.match(
  monitoringStyles,
  /\.maplibre-personnel-marker\.is-followed\s*\{[\s\S]*?z-index:\s*10/,
  'The followed officer must render above overlapping cluster markers',
)
assert.match(personnelMapSource, /cancelAnimationFrame/, 'Superseded marker animations must be cancelled')
assert.match(personnelMapSource, /markerMotionForFixes/, 'Web markers must use adaptive confirmed-fix motion')
assert.match(personnelMapSource, /motionDuration/, 'Web cluster centroids must inherit adaptive motion timing')
assert.match(personnelMapSource, /map\.on\('zoom', handleZoom\)/, 'Clusters must regroup automatically while zooming')
assert.match(personnelMapSource, /state\.marker\.remove\(\)[\s\S]*state\.isOnMap = false/, 'Clustered DOM markers must leave the active map render loop')
assert.match(personnelMapSource, /!state\.isOnMap && member\.id !== followedPersonnelId/, 'Hidden clustered markers must skip redundant individual animations')
assert.match(mapPreviewSource, /import\.meta\.env\.DEV/, 'Mock map markers must remain development-only')
assert.match(mapPreviewSource, /MOCK_MAP_PERSONNEL_COUNT = 96/, 'Cluster preview must retain a dense marker dataset')
assert.match(mapControlsSource, /Use street map/, 'Street map control must remain available')
assert.match(mapControlsSource, /Use satellite map/, 'Satellite map control must remain available')
assert.match(mapControlsSource, /Enable 3D terrain/, '3D terrain control must remain available')
assert.match(
  monitoringStyles,
  /\.map-style-control\s*\{[\s\S]*?width:\s*56px[\s\S]*?gap:\s*4px[\s\S]*?\.map-style-button\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/,
  'Map style labels and active states must stay inside a sufficiently wide control',
)
assert.match(
  monitoringStyles,
  /\.map-style-button span\s*\{[\s\S]*?width:\s*100%[\s\S]*?overflow:\s*hidden/,
  'Map style labels must not overflow the control boundary',
)
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
assert.match(mapLayersSource, /maxzoom:\s*12/, '3D terrain must cap source detail for responsive rendering')
assert.match(mapLayersSource, /bounds:\s*CABAGAN_TERRAIN_BOUNDS/, '3D terrain requests must stay scoped to Cabagan')
assert.match(mapLayersSource, /\['has', 'render_height'\]/, '3D buildings must skip polygons without extrusion height data')

process.stdout.write('Web MapLibre checks passed: adaptive confirmed-fix interpolation, speed fallback, jitter suppression, animated clustering, Map/Satellite styles, dark theme, 3D terrain/buildings, and report-route rendering.\n')
