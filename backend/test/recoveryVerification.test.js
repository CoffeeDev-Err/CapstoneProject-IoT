const assert = require('node:assert/strict')
const { it } = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { mongo: { BSON } } = require('mongoose')
const { capture, assertTarget, bsonHashes, documentHash, digest } = require('../scripts/recovery-verify')

it('rejects production/remote recovery targets and ambiguous database names', () => {
	assert.doesNotThrow(() => assertTarget('mongodb://127.0.0.1:27018', 'geosentri_restore_20260915'))
	for (const uri of ['mongodb+srv://cluster.example', 'mongodb://host:27017', 'mongodb://user:pass@localhost:27017', 'mongodb://localhost:27017/production']) {
		assert.throws(() => assertTarget(uri, 'geosentri_restore_test'), /loopback/)
	}
	assert.throws(() => assertTarget('mongodb://localhost:27018', 'geosentri'), /prefix/)
})

it('detects truncated dumps and preserves BSON types in content fingerprints', () => {
	assert.throws(() => bsonHashes(Buffer.from([10, 0, 0, 0, 0])), /Invalid BSON/)
	assert.throws(() => bsonHashes(Buffer.from([1, 2])), /Truncated BSON/)
	assert.notEqual(documentHash({ x: new BSON.Int32(1) }), documentHash({ x: BSON.Long.fromNumber(1) }))
	assert.equal(digest(['b', 'a']), digest(['a', 'b']))
})

it('captures counts, indexes and evidence hashes from an actual BSON fixture', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'geosentri-recovery-test-'))
	const dump = path.join(root, 'dump')
	const evidence = path.join(root, 'evidence')
	try {
		await fs.mkdir(dump)
		await fs.mkdir(evidence)
		await fs.writeFile(path.join(dump, 'reports.bson'), Buffer.concat([
			BSON.serialize({ _id: new BSON.ObjectId(), title: 'Synthetic report' }),
			BSON.serialize({ _id: new BSON.ObjectId(), title: 'Second report' }),
		]))
		await fs.writeFile(path.join(dump, 'reports.metadata.json'), JSON.stringify({ indexes: [{ v: 2, name: '_id_', key: { _id: 1 } }] }))
		await fs.writeFile(path.join(evidence, 'synthetic.txt'), 'synthetic evidence bytes')
		const result = await capture({ dump, evidence, backupStartedAt: '2026-01-01T00:00:00Z' })
		assert.equal(result.collections[0].count, 2)
		assert.equal(result.collections[0].indexes[0].name, '_id_')
		assert.equal(result.evidence.length, 1)
		const previous = result.evidence[0].sha256
		await fs.writeFile(path.join(evidence, 'synthetic.txt'), 'changed bytes')
		const changed = await capture({ dump, evidence, backupStartedAt: '2026-01-01T00:00:00Z' })
		assert.notEqual(changed.evidence[0].sha256, previous)
	} finally {
		// Only the exact fresh directory returned by mkdtemp is removed.
		assert.equal(path.dirname(root), os.tmpdir())
		assert.ok(path.basename(root).startsWith('geosentri-recovery-test-'))
		await fs.rm(root, { recursive: true, force: true })
	}
})
