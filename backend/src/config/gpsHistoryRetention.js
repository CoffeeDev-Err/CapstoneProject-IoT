const RETENTION_SECONDS = 30 * 86400

// MongoDB does not update an existing TTL index when a schema option changes.
// Alter only the known recordedAt TTL index; never sync/drop unrelated indexes.
const ensureGpsHistoryRetention = async (database) => {
	const collection = database.collection('location_history')
	let indexes
	try { indexes = await collection.listIndexes().toArray() } catch (error) {
		if (error.code === 26) return // Collection will be created with the new schema.
		throw error
	}
	const ttl = indexes.find(index => Object.keys(index.key).length === 1
		&& index.key.recordedAt === 1 && index.expireAfterSeconds !== undefined)
	if (!ttl || ttl.expireAfterSeconds === RETENTION_SECONDS) return

	try {
		await database.command({ collMod: 'location_history', index: { name: ttl.name, expireAfterSeconds: RETENTION_SECONDS } })
	} catch (error) {
		const collModForbidden = (error.code === 13 || error.code === 8000)
			&& /collMod|not allowed|unauthorized/i.test(error.message || '')
		if (!collModForbidden) throw error
		// Atlas readWrite users may manage indexes but cannot run collMod.
		await collection.dropIndex(ttl.name)
		await collection.createIndex(ttl.key, { name: ttl.name, expireAfterSeconds: RETENTION_SECONDS })
	}
}
module.exports = ensureGpsHistoryRetention
