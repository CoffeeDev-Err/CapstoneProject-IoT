const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(projectRoot, 'src', 'utils', 'officerMapMath.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const nativeMapSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'components', 'OfficerMapCanvas.native.tsx'),
	'utf8',
)
const officerMapScreenSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'screens', 'OfficerMapScreen.tsx'),
	'utf8',
) + '\n' + fs.readFileSync(
	path.join(projectRoot, 'src', 'features', 'maps', 'leafletMapHtml.ts'),
	'utf8',
) + '\n' + fs.readFileSync(
	path.join(projectRoot, 'src', 'features', 'maps', 'MapControls.tsx'),
	'utf8',
)
const mainTabsSource = fs.readFileSync(
	path.join(projectRoot, 'src', 'navigation', 'MainTabs.tsx'),
	'utf8',
)
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
	fileName: sourcePath,
}).outputText
const loadedModule = { exports: {} }
new Function('module', 'exports', 'require', output)(
	loadedModule,
	loadedModule.exports,
	require,
)

const {
	CLUSTER_MAX_ZOOM,
	GPS_UPDATE_INTERVAL_MS,
	MARKER_ANIMATION_DURATION_MS,
	VEHICLE_MARKER_ANIMATION_DURATION_MS,
	WALKING_MARKER_ANIMATION_DURATION_MS,
	calculatedSpeedKmhBetweenFixes,
	clusterPersonnel,
	easeOutCubic,
	interpolatePosition,
	markerMotionForFixes,
	resolveMotionSpeedKmh,
} = loadedModule.exports

const officer = (id, latitude, longitude, flags = {}) => ({
	id,
	name: id,
	latitude,
	longitude,
	...flags,
})

assert.equal(easeOutCubic(0), 0, 'Interpolation must start at the confirmed old position')
assert.equal(easeOutCubic(1), 1, 'Interpolation must finish at the confirmed new position')
assert.equal(easeOutCubic(-1), 0, 'Interpolation progress must be clamped below zero')
assert.equal(easeOutCubic(2), 1, 'Interpolation progress must be clamped above one')

const halfway = interpolatePosition([121.7, 17.4], [121.8, 17.5], 0.5)
assert.ok(Math.abs(halfway[0] - 121.75) < 1e-10, 'Longitude must move linearly between GPS fixes')
assert.ok(Math.abs(halfway[1] - 17.45) < 1e-10, 'Latitude must move linearly between GPS fixes')
assert.deepEqual(
	interpolatePosition([121.7, 17.4], [121.8, 17.5], 1),
	[121.8, 17.5],
	'Animation must land on the exact GPS destination',
)
assert.equal(GPS_UPDATE_INTERVAL_MS, 10_000, 'Mobile GPS cadence must match the tracker upload interval')
assert.equal(MARKER_ANIMATION_DURATION_MS, 2_000, 'Mobile default motion must remain a two-second slow catch-up')
assert.equal(WALKING_MARKER_ANIMATION_DURATION_MS, 2_000, 'Walking fixes must retain smooth two-second motion')
assert.equal(VEHICLE_MARKER_ANIMATION_DURATION_MS, 900, 'Vehicle fixes must catch up in under one second')

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
assert.match(nativeMapSource, /markerMotionForFixes/, 'Native markers and follow camera must share adaptive motion timing')
assert.match(nativeMapSource, /cancelAnimationFrame\(animationFrame\.current\)/, 'A newer GPS update must cancel the previous animation')
assert.match(nativeMapSource, /STREET_FOCUS_ZOOM\s*=\s*16/, 'Following must preserve street-map context')
assert.match(nativeMapSource, /SATELLITE_FOCUS_ZOOM\s*=\s*15/, 'Following must not over-zoom satellite imagery')
assert.match(nativeMapSource, /motionByOfficer\.current\.get\(followedOfficerId\)/, 'The camera must follow only the selected officer')
assert.match(nativeMapSource, /member\.id !== followedOfficerId/, 'The followed officer must remain visible outside clusters')
assert.match(nativeMapSource, /mapStyleRevision/, 'Native style changes must remount MapLibre reliably')
assert.match(officerMapScreenSource, /Following <Text/, 'Following mode must replace the officer sheet with a compact banner')
assert.match(officerMapScreenSource, /mapControlsExpanded/, 'Mobile map controls must be collapsible')
assert.match(officerMapScreenSource, /Animated\.timing\(mapControlsProgress/, 'Map controls must animate open and closed')
assert.match(officerMapScreenSource, />\s*Satellite\s*</, 'The satellite map option must have a visible label')
assert.match(officerMapScreenSource, />\s*Terrain\s*</, 'The terrain option must have a visible label')
assert.doesNotMatch(
	officerMapScreenSource,
	/mapModeControlExpanded:\s*\{[^}]*width:/,
	'Expanded mobile map controls must retain their compact fixed width',
)
assert.match(nativeMapSource, /compassPosition=\{\{\s*top:\s*150,\s*left:\s*12\s*\}\}/, 'The compass must not sit behind the expanded map control')
assert.match(nativeMapSource, /nativeEvent\.userInteraction/, 'Header visibility must react only to manual native map gestures')
assert.match(mainTabsSource, /useNativeDriver:\s*true/, 'Header hiding must stay on the native animation thread')
assert.match(
	mainTabsSource,
	/headerOverlay:\s*\{[\s\S]*position:\s*'absolute'/,
	'The shared header must overlay the map instead of resizing its flex scene',
)
assert.doesNotMatch(
	mainTabsSource,
	/const headerHeight\s*=|height:\s*headerHeight/,
	'Map gestures must never animate the header layout height and resize MapLibre',
)
assert.match(
	officerMapScreenSource,
	/paddingTop:\s*headerTopInset \+ headerContentHeight[\s\S]*translateY:\s*overlayTranslateY/,
	'The search controls must move with the overlay while preserving the status-bar safe area',
)
assert.match(
	mainTabsSource,
	/<OfficerMapScreen[\s\S]*?onMapInteractionChange=\{handleMapInteractionChange\}/,
	'Map gestures must control the shared page header',
)
assert.doesNotMatch(nativeMapSource, /geosentri-patrol-area/, 'The obsolete dashed patrol-radius guide must stay hidden')
assert.doesNotMatch(officerMapScreenSource, /L\.circle\(/, 'The web fallback must not restore the patrol-radius guide')
assert.match(officerMapScreenSource, /backgroundColor:\s*'#0b1528'/, 'The backup control must use the navy map-control surface')
// The mapHtml memo runs on native too (hooks are unconditional), and Hermes
// defines `window` but leaves `window.location` undefined, so the host-origin
// pin must guard the location itself — not just `window` — or the native APK
// crashes on load with "Cannot read property 'origin' of undefined". Typecheck
// cannot catch this (the unguarded form is valid TS), so it is asserted here.
assert.match(
	officerMapScreenSource,
	/typeof window !== 'undefined' && window\.location/,
	'The web map frame must guard window.location before reading .origin, or the native APK crashes on load.',
)
assert.doesNotMatch(
	officerMapScreenSource,
	/!== 'undefined'\s*\?\s*window\.location\.origin/,
	'The unguarded window.location.origin form crashes the native APK; keep the window.location guard while preserving the postMessage origin pin.',
)

const personnel = [
	officer('duty', 17.4269, 121.7653),
	officer('operation', 17.42691, 121.76531, { operationActive: true }),
	officer('critical', 17.42692, 121.76532, { emergencyActive: true }),
	officer('far', 17.8, 122.1),
	officer('invalid', Number.NaN, 121.7),
]
const clustered = clusterPersonnel(personnel, 14)
assert.equal(clustered.length, 2, 'Nearby officers must cluster while a distant officer remains separate')
const nearbyCluster = clustered.find((cluster) => cluster.members.length === 3)
assert.ok(nearbyCluster, 'The three nearby officers must share one cluster')
assert.equal(nearbyCluster.tone, 'backup', 'A cluster must inherit its highest-priority marker state')
assert.equal(nearbyCluster.id, 'critical-duty-operation', 'Cluster IDs must remain stable')
assert.deepEqual(
	clusterPersonnel([...personnel].reverse(), 14).map((cluster) => cluster.id).sort(),
	clustered.map((cluster) => cluster.id).sort(),
	'Cluster membership must not depend on personnel payload order',
)

// A and B are within the radius, as are B and C, while A and C are not.
// This chain exposed the old seed-order dependency: [A,B,C] produced A-B + C,
// while [B,A,C] produced A-B-C.
const chainPersonnel = [
	officer('a', 17.4269, 121.7653),
	officer('b', 17.4269, 121.7693),
	officer('c', 17.4269, 121.7733),
]
assert.deepEqual(
	clusterPersonnel(chainPersonnel, 14).map((cluster) => cluster.id).sort(),
	clusterPersonnel([chainPersonnel[1], chainPersonnel[0], chainPersonnel[2]], 14)
		.map((cluster) => cluster.id)
		.sort(),
	'Chain-shaped clusters must remain deterministic when payload order changes',
)

const individual = clusterPersonnel(personnel, CLUSTER_MAX_ZOOM)
assert.equal(individual.length, 4, 'Valid markers must separate at the maximum clustering zoom')
assert.ok(individual.every((cluster) => cluster.members.length === 1), 'Close zoom must show individual markers')

const movedPersonnel = personnel.map((member) => (
	member.id === 'far'
		? { ...member, latitude: 17.42693, longitude: 121.76533 }
		: member
))
assert.equal(
	clusterPersonnel(movedPersonnel, 14).length,
	1,
	'Cluster membership must update after a new GPS coordinate arrives',
)

const densePersonnel = Array.from({ length: 2_000 }, (_, index) => (
	officer(`dense-${index}`, 17.4269, 121.7653)
))
const performanceStartedAt = performance.now()
const denseClusters = clusterPersonnel(densePersonnel, 14)
const elapsedMilliseconds = performance.now() - performanceStartedAt
assert.equal(denseClusters.length, 1, 'A dense group must produce one cluster')
assert.ok(elapsedMilliseconds < 500, `Dense clustering exceeded its 500ms guard (${elapsedMilliseconds.toFixed(1)}ms)`)

process.stdout.write(
	`Map behavior checks passed: adaptive motion, calculated-speed fallback, jitter suppression, clustering, priority, zoom separation, invalid-coordinate filtering, and 2,000-marker performance (${elapsedMilliseconds.toFixed(1)}ms).\n`,
)
