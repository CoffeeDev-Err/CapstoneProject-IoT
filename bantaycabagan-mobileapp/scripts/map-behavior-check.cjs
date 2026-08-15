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
	clusterPersonnel,
	easeOutCubic,
	interpolatePosition,
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
assert.ok(Math.abs(halfway[0] - 121.7875) < 1e-10, 'Longitude must use ease-out interpolation')
assert.ok(Math.abs(halfway[1] - 17.4875) < 1e-10, 'Latitude must use ease-out interpolation')
assert.deepEqual(
	interpolatePosition([121.7, 17.4], [121.8, 17.5], 1),
	[121.8, 17.5],
	'Animation must land on the exact GPS destination',
)
assert.match(nativeMapSource, /MARKER_ANIMATION_DURATION\s*=\s*700/, 'Mobile interpolation must remain at 700ms')
assert.match(nativeMapSource, /cancelAnimationFrame\(animationFrame\.current\)/, 'A newer GPS update must cancel the previous animation')
assert.match(nativeMapSource, /STREET_FOCUS_ZOOM\s*=\s*16/, 'Following must preserve street-map context')
assert.match(nativeMapSource, /SATELLITE_FOCUS_ZOOM\s*=\s*15/, 'Following must not over-zoom satellite imagery')
assert.match(nativeMapSource, /item\.id === followedOfficerId/, 'The camera must follow only the selected officer')
assert.match(nativeMapSource, /member\.id !== followedOfficerId/, 'The followed officer must remain visible outside clusters')
assert.match(nativeMapSource, /mapStyleRevision/, 'Native style changes must remount MapLibre reliably')
assert.match(officerMapScreenSource, /Following <Text/, 'Following mode must replace the officer sheet with a compact banner')
assert.match(officerMapScreenSource, /mapControlsExpanded/, 'Mobile map controls must be collapsible')

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
assert.equal(nearbyCluster.tone, 'critical', 'A cluster must inherit its highest-priority marker state')
assert.equal(nearbyCluster.id, 'critical-duty-operation', 'Cluster IDs must remain stable')

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
	`Map behavior checks passed: interpolation endpoints, clustering, priority, zoom separation, invalid-coordinate filtering, and 2,000-marker performance (${elapsedMilliseconds.toFixed(1)}ms).\n`,
)
