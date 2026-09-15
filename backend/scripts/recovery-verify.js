// Offline backup manifest + read-only verification of an isolated local restore.
// Does not load .env, start the application, send notifications, or modify MongoDB.
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { parseArgs } = require('node:util')
const { mongo: { BSON, MongoClient } } = require('mongoose')

const hash = (value) => createHash('sha256').update(value).digest('hex')
const canonical = (value) => {
	if (Array.isArray(value)) return value.map(canonical)
	if (value && typeof value === 'object') return Object.fromEntries(
		Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
	)
	return value
}
const documentHash = (doc) => hash(JSON.stringify(canonical(BSON.EJSON.serialize(doc, { relaxed: false }))))
const digest = (hashes) => hash(hashes.sort().join('\n'))
const normalizeIndexes = (indexes) => indexes.map(({ v: _v, ns: _ns, background: _background, ...index }) => index)
	.sort((a, b) => a.name.localeCompare(b.name))
const bsonHashes = (buffer) => {
	const hashes = []
	for (let offset = 0; offset < buffer.length;) {
		if (offset + 4 > buffer.length) throw new Error('Truncated BSON document')
		const size = buffer.readInt32LE(offset)
		if (size < 5 || offset + size > buffer.length) throw new Error('Invalid BSON document size')
		hashes.push(documentHash(BSON.deserialize(buffer.subarray(offset, offset + size), { promoteValues: false })))
		offset += size
	}
	return hashes
}
const evidenceManifest = async (directory, prefix = '') => {
	const files = []
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		if (entry.isSymbolicLink()) throw new Error('Evidence directory must not contain symbolic links')
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name
		const absolute = path.join(directory, entry.name)
		if (entry.isDirectory()) files.push(...await evidenceManifest(absolute, relative))
		else if (entry.isFile()) files.push({ path: relative, sha256: hash(await fs.readFile(absolute)) })
	}
	return files.sort((a, b) => a.path.localeCompare(b.path))
}
const assertTarget = (uri, database) => {
	if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(uri || '')) {
		throw new Error('RECOVERY_TARGET_URI must be an explicit loopback MongoDB URI with a port and no credentials')
	}
	if (!/^geosentri_restore_[a-zA-Z0-9_]+$/.test(database || '')) {
		throw new Error('Target database must use the geosentri_restore_ prefix')
	}
}
const requireDate = (value, name) => {
	const date = Date.parse(value)
	if (!Number.isFinite(date) || date > Date.now()) throw new Error(`${name} must be a past ISO timestamp`)
	return date
}
const capture = async ({ dump, evidence, backupStartedAt }) => {
	requireDate(backupStartedAt, 'backup-started-at')
	const collections = []
	for (const name of (await fs.readdir(dump)).filter((name) => name.endsWith('.bson')).sort()) {
		const collection = name.slice(0, -5)
		const content = await fs.readFile(path.join(dump, name))
		const docs = bsonHashes(content)
		const metadata = BSON.EJSON.parse(await fs.readFile(path.join(dump, `${collection}.metadata.json`), 'utf8'))
		if (metadata.options && Object.keys(metadata.options).length) {
			throw new Error('Collection options require an extended restore review before using this verifier')
		}
		collections.push({ name: collection, count: docs.length, contentDigest: digest(docs),
			bsonSha256: hash(content), indexes: normalizeIndexes(metadata.indexes || []) })
	}
	if (!collections.length) throw new Error('No uncompressed BSON collections found in the database dump directory')
	const files = await evidenceManifest(evidence)
	if (!files.length) throw new Error('No evidence files found; provide a representative evidence backup')
	return { schemaVersion: 1, backupStartedAt, capturedAt: new Date().toISOString(),
		sourceDatabase: path.basename(path.resolve(dump)), collections, evidence: files }
}
const verify = async ({ manifest, database, evidence, restoreStartedAt, uri }) => {
	assertTarget(uri, database)
	const startedAt = requireDate(restoreStartedAt, 'restore-started-at')
	if (manifest.schemaVersion !== 1 || !manifest.collections?.length || !manifest.evidence?.length) {
		throw new Error('Incomplete backup manifest')
	}
	const backupAt = requireDate(manifest.backupStartedAt, 'manifest backupStartedAt')
	if (backupAt > startedAt) throw new Error('Backup must predate the restore start')
	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000, promoteValues: false })
	const mismatches = []
	try {
		await client.connect()
		const db = client.db(database)
		await db.command({ ping: 1 })
		const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name).sort()
		if (JSON.stringify(names) !== JSON.stringify(manifest.collections.map((entry) => entry.name).sort())) {
			mismatches.push('collection-set')
		}
		for (const expected of manifest.collections) {
			if (!names.includes(expected.name)) continue
			const collection = db.collection(expected.name)
			const hashes = []
			for await (const document of collection.find({})) hashes.push(documentHash(document))
			if (hashes.length !== expected.count || digest(hashes) !== expected.contentDigest) mismatches.push(`${expected.name}:documents`)
			const indexes = normalizeIndexes(await collection.listIndexes().toArray())
			// Canonical EJSON preserves BSON scalar types in both metadata and server responses.
			if (JSON.stringify(canonical(BSON.EJSON.serialize(indexes))) !== JSON.stringify(canonical(BSON.EJSON.serialize(expected.indexes)))) {
				mismatches.push(`${expected.name}:indexes`)
			}
		}
		if (JSON.stringify(await evidenceManifest(evidence)) !== JSON.stringify(manifest.evidence)) mismatches.push('evidence-checksums')
	} finally { await client.close() }
	return { verifiedAt: new Date().toISOString(), passed: mismatches.length === 0, mismatches,
		collections: manifest.collections.length, documents: manifest.collections.reduce((sum, entry) => sum + entry.count, 0),
		evidenceFiles: manifest.evidence.length, restoreVerificationSeconds: (Date.now() - startedAt) / 1000,
		backupAgeAtRestoreStartSeconds: (startedAt - backupAt) / 1000,
		scope: 'Local database content/index and evidence-byte verification; excludes application/cloud failover and backup scheduling.' }
}
const main = async () => {
	const { values, positionals } = parseArgs({ allowPositionals: true, options: {
		dump: { type: 'string' }, evidence: { type: 'string' }, output: { type: 'string' },
		manifest: { type: 'string' }, database: { type: 'string' },
		'backup-started-at': { type: 'string' }, 'restore-started-at': { type: 'string' },
	} })
	if (!values.output || !values.evidence) throw new Error('--output and --evidence are required')
	let result
	if (positionals[0] === 'manifest') result = await capture({
		dump: values.dump, evidence: values.evidence, backupStartedAt: values['backup-started-at'],
	})
	else if (positionals[0] === 'verify') result = await verify({
		manifest: BSON.EJSON.parse(await fs.readFile(values.manifest, 'utf8')),
		database: values.database, evidence: values.evidence, uri: process.env.RECOVERY_TARGET_URI,
		restoreStartedAt: values['restore-started-at'],
	})
	else throw new Error('Use manifest or verify')
	await fs.writeFile(values.output, `${BSON.EJSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
	console.log(JSON.stringify({ outputWritten: true, passed: result.passed, collections: result.collections?.length || result.collections }))
	if (result.passed === false) process.exitCode = 1
}
if (require.main === module) main().catch((error) => {
	console.error('Recovery verification failed:', error.name, error.code || 'check inputs, tooling, and local MongoDB access')
	process.exitCode = 1
})
module.exports = { capture, assertTarget, bsonHashes, documentHash, digest, evidenceManifest }
