// Reproducible geography contract. Raw mapaPH exports are never rewritten.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { CABAGAN_BARANGAYS } = require('../backend/src/constants/cabaganBarangays')
const directory = path.join(__dirname, '../contracts/geography')
const read = name => fs.readFileSync(path.join(directory, name))
const municipalRaw = read('cabagan-municipality.source.json')
const barangayRaw = read('cabagan-barangays.source.json')
// Existing navigation hints stay separate from the new interior LABEL points.
// They are not boundaries or surveyed posts, and must remain inside coverage.
const navigationReferences = JSON.parse(read('cabagan-navigation-references.json'))
const municipality = JSON.parse(municipalRaw).features[0]
const barangays = JSON.parse(barangayRaw).features
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const key = point => point.join(',')
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|')
const sx = 106265, sy = 110674
const project = ([x, y]) => [(x - 121.8) * sx, (y - 17.39) * sy]
const unproject = ([x, y]) => [x / sx + 121.8, y / sy + 17.39]
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const area = ring => ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0) / 2
const inside = (p, ring) => {
  let result = false
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result
  }
  return result
}
const nearest = (p, ring) => {
  let best = { distance: Infinity }
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    const point = [a[0] + t * dx, a[1] + t * dy]
    const distance = Math.hypot(p[0] - point[0], p[1] - point[1])
    if (distance < best.distance) best = { distance, point, edge: i - 1, t }
  }
  return best
}
// Pole of inaccessibility: a label point is explicitly checked inside the polygon.
const interiorPoint = ring => {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const size = Math.min(maxX - minX, maxY - minY), heap = []
  const cell = (x, y, h) => {
    const d = nearest([x, y], ring).distance * (inside([x, y], ring) ? 1 : -1)
    return { x, y, h, d, max: d + h * Math.SQRT2 }
  }
  const push = c => {
    heap.push(c)
    let i = heap.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].max >= c.max) break; heap[i] = heap[p]; i = p }
    heap[i] = c
  }
  const pop = () => {
    const top = heap[0], last = heap.pop()
    if (heap.length) {
      let i = 0
      while (2 * i + 1 < heap.length) {
        const l = 2 * i + 1, r = l + 1, j = r < heap.length && heap[r].max > heap[l].max ? r : l
        if (heap[j].max <= last.max) break
        heap[i] = heap[j]; i = j
      }
      heap[i] = last
    }
    return top
  }
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0)
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) push(cell(x + size / 2, y + size / 2, size / 2))
  while (heap.length) {
    const c = pop()
    if (c.d > best.d) best = c
    if (c.max - best.d <= 0.1) continue
    const h = c.h / 2
    for (const dx of [-h, h]) for (const dy of [-h, h]) push(cell(c.x + dx, c.y + dy, h))
  }
  if (best.d <= 0 || !inside([best.x, best.y], ring)) throw new Error('No verified interior point')
  const [longitude, latitude] = unproject([best.x, best.y])
  return { latitude, longitude }
}

// Snap only the shared OUTER boundary network. Internal shared edges remain
// identical on both sides. Insert every intervening municipality vertex rather
// than drawing simplified chords across bends. Refuse unexpected source drift.
const municipalRing = municipality.geometry.coordinates[0]
const projectedMunicipality = municipalRing.map(project), cumulative = [0]
for (let i = 1; i < municipalRing.length; i++) cumulative.push(cumulative.at(-1) + Math.hypot(projectedMunicipality[i][0] - projectedMunicipality[i - 1][0], projectedMunicipality[i][1] - projectedMunicipality[i - 1][1]))
const perimeter = cumulative.at(-1), edges = new Map(), vertices = new Map()
for (const feature of barangays) {
  const ring = feature.geometry.coordinates[0]
  if (feature.geometry.type !== 'Polygon' || feature.geometry.coordinates.length !== 1 || area(ring.map(project)) >= 0) throw new Error('Unexpected source geometry')
  for (let i = 1; i < ring.length; i++) {
    const k = edgeKey(ring[i - 1], ring[i])
    edges.set(k, (edges.get(k) || 0) + 1)
  }
}
let maxAdjustmentMeters = 0
for (const feature of barangays) {
  const ring = feature.geometry.coordinates[0]
  for (let i = 1; i < ring.length; i++) if (edges.get(edgeKey(ring[i - 1], ring[i])) === 1) {
    for (const p of [ring[i - 1], ring[i]]) {
      if (vertices.has(key(p))) continue
      const n = nearest(project(p), projectedMunicipality)
      if (n.distance > 7) throw new Error('Outer boundary discrepancy exceeds the audited 7 m limit')
      maxAdjustmentMeters = Math.max(maxAdjustmentMeters, n.distance)
      // Preserve exact original municipal coordinates at segment endpoints.
      const point = n.t < 1e-10 ? municipalRing[n.edge] : n.t > 1 - 1e-10 ? municipalRing[n.edge + 1] : unproject(n.point)
      vertices.set(key(p), { point, s: cumulative[n.edge] + n.t * (cumulative[n.edge + 1] - cumulative[n.edge]) })
    }
  }
}
const features = barangays.map(feature => {
  const catalog = CABAGAN_BARANGAYS.find(b => b.psgcCode === feature.properties.psgc && b.name === feature.properties.name)
  if (!catalog || feature.properties.municity_psgc !== municipality.properties.psgc) throw new Error('Barangay catalog mismatch')
  const original = feature.geometry.coordinates[0], ring = []
  for (let i = 1; i < original.length; i++) {
    const a = original[i - 1], b = original[i], start = vertices.get(key(a)), end = vertices.get(key(b))
    ring.push(start?.point || a)
    if (edges.get(edgeKey(a, b)) !== 1) continue
    const span = (start.s - end.s + perimeter) % perimeter
    if (span > perimeter / 2) throw new Error('Non-monotonic outer boundary projection')
    const intermediate = municipalRing.slice(0, -1).map((point, j) => ({ point, delta: (start.s - cumulative[j] + perimeter) % perimeter }))
      .filter(p => p.delta > 1e-6 && p.delta < span - 1e-6).sort((p, q) => p.delta - q.delta)
    ring.push(...intermediate.map(p => p.point))
  }
  const clean = ring.filter((p, i) => !i || key(p) !== key(ring[i - 1]))
  if (key(clean[0]) === key(clean.at(-1))) clean.pop()
  clean.push(clean[0]); clean.reverse() // Canonical CCW exterior.
  const center = interiorPoint(clean.map(project)), navigationCenter = navigationReferences[catalog.code]
  if (!navigationCenter || !inside(project([navigationCenter.longitude, navigationCenter.latitude]), clean.map(project))) throw new Error('Navigation reference is outside coverage')
  return { type: 'Feature', properties: { barangay: catalog.name, code: catalog.code, psgc: catalog.psgcCode, center, navigationCenter }, geometry: { type: 'Polygon', coordinates: [clean] } }
})
if (features.length !== 26 || new Set(features.map(f => f.properties.code)).size !== 26) throw new Error('Expected 26 unique barangays')
const sumArea = features.reduce((sum, f) => sum + area(f.geometry.coordinates[0].map(project)), 0)
if (Math.abs(sumArea - area(projectedMunicipality)) > 0.01) throw new Error('Reconciled barangays do not tile the municipality')
// Refuse self-intersections, including non-adjacent touches/collinear overlaps.
for (const feature of features) {
  const r = feature.geometry.coordinates[0].map(project), n = r.length - 1
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    const a = r[i], b = r[i + 1], c = r[j], d = r[j + 1]
    const min = axis => Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]))
    const max = axis => Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]))
    if (min(0) > max(0) + 1e-8 || min(1) > max(1) + 1e-8) continue
    if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) throw new Error(`Self intersection: ${feature.properties.barangay}`)
  }
}
const projectedFeatures = features.map(f => f.geometry.coordinates[0].map(project))
for (let i = 0; i < features.length; i++) {
  const ring = projectedFeatures[i]
  for (let j = i + 1; j < features.length; j++) {
    const other = projectedFeatures[j]
    for (let a = 1; a < ring.length; a++) for (let b = 1; b < other.length; b++) {
      const p = ring[a - 1], q = ring[a], r = other[b - 1], s = other[b]
      const c1 = cross(p, q, r), c2 = cross(p, q, s), c3 = cross(r, s, p), c4 = cross(r, s, q)
      if (((c1 > 1e-6 && c2 < -1e-6) || (c1 < -1e-6 && c2 > 1e-6)) && ((c3 > 1e-6 && c4 < -1e-6) || (c3 < -1e-6 && c4 > 1e-6))) throw new Error('Crossing barangay boundaries')
    }
    for (const [a, b] of [[ring, other], [other, ring]]) for (const p of a) {
      if (inside(p, b) && nearest(p, b).distance > 0.0001) throw new Error('Overlapping barangay interiors')
    }
  }
  for (let j = 1; j < ring.length; j++) {
    const a = ring[j - 1], b = ring[j]
    for (const t of [0, 0.5, 1]) {
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
      if (!inside(p, projectedMunicipality) && nearest(p, projectedMunicipality).distance > 0.0001) throw new Error('Barangay outside municipality')
    }
  }
}
const contract = {
  version: `mapaph-2026-11-14-${hash(Buffer.concat([municipalRaw, barangayRaw])).slice(0, 12)}`,
  attribution: 'mapaPH GeoJSON exports, downloaded 2026-11-14. Indicative operational boundaries; not a cadastral survey.',
  sources: { municipality: hash(municipalRaw), barangays: hash(barangayRaw) },
  reconciliation: { method: 'Project shared exterior vertices to the municipal ring and insert intervening municipal vertices; preserve shared internal topology.', limitMeters: 7, maxAdjustmentMeters },
  municipality,
  barangays: { type: 'FeatureCollection', features },
}
const output = JSON.stringify(contract) + '\n'
const centers = JSON.stringify(Object.fromEntries(features.map(f => [f.properties.code, f.properties.center])), null, 2) + '\n'
const domainPath = path.join(__dirname, '../contracts/domain-contracts.json')
const domainText = fs.readFileSync(domainPath, 'utf8')
const domain = JSON.parse(domainText)
const latLng = municipalRing.slice(0, -1).map(([lng, lat]) => [lat, lng])
domain.geofence.coordinateCount = latLng.length
domain.geofence.sha256 = hash(JSON.stringify(latLng))
domain.geofence.probes[2] = { latitude: latLng[0][0], longitude: latLng[0][1], inside: true }
const geofenceText = `"geofence": {\n    "coordinateCount": ${latLng.length},\n    "sha256": "${domain.geofence.sha256}",\n    "probes": [\n${domain.geofence.probes.map(p => `      { "latitude": ${p.latitude}, "longitude": ${p.longitude}, "inside": ${p.inside} }`).join(',\n')}\n    ]\n  },`
const targets = [
  ['contracts/geography/cabagan-geography.json', output],
  ['contracts/cabagan-patrol-centers.json', centers],
  ['bantaycabagan-mobileapp/src/constants/data/cabagan-geography.json', output],
  ['contracts/domain-contracts.json', domainText.replace(/"geofence": \{[\s\S]*?\n  \},/, geofenceText)],
]
for (const [name, content] of targets) {
  const target = path.join(__dirname, '..', name)
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error(`Stale generated geography: ${name}`)
  } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content) }
}
console.log(`Geography ${contract.version}: 26 interior points; maximum exterior adjustment ${maxAdjustmentMeters.toFixed(3)} m. ${process.argv.includes('--check') ? 'Generated files match.' : 'Generated files written.'}`)
