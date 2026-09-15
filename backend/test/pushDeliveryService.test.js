const assert = require('node:assert/strict')
const { it } = require('node:test')
const {
	createPushDeliveryService, RECEIPT_DELAY_MS, DELIVERY_WINDOW_MS, LEASE_MS,
} = require('../src/services/pushDeliveryService')

// Shared durable-store stand-in: each worker gets the same rows, with atomic
// conditional claims. No external Expo requests or application DB access.
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
	if (key === '$or') return value.some((part) => matches(row, part))
	if (value === null) return row[key] == null
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		return Object.entries(value).every(([operator, operand]) => (
			operator === '$lte' ? row[key] <= operand : assert.fail(`Unhandled ${operator}`)
		))
	}
	return row[key] === value
})
const apply = (row, update) => {
	Object.assign(row, structuredClone(update.$set || {}))
	for (const [key, amount] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + amount
	for (const key of Object.keys(update.$unset || {})) delete row[key]
}
const collection = (rows) => ({
	find(filter) {
		let result = rows.filter((row) => matches(row, filter))
		return {
			sort(spec) { const key = Object.keys(spec)[0]; result.sort((a, b) => a[key] - b[key]); return this },
			limit(count) { result = result.slice(0, count); return this },
			lean: async () => structuredClone(result),
		}
	},
	findOne(filter) { return { lean: async () => structuredClone(rows.find((row) => matches(row, filter))) } },
	async updateOne(filter, update, options = {}) {
		const row = rows.find((entry) => matches(entry, filter))
		if (row) { apply(row, update); return { modifiedCount: 1 } }
		if (options.upsert) {
			rows.push({ _id: `row-${rows.length}`, ...structuredClone(update.$setOnInsert) })
			return { upsertedCount: 1 }
		}
		return { modifiedCount: 0 }
	},
	findOneAndUpdate(filter, update, options) {
		const key = Object.keys(options.sort)[0]
		const row = rows.filter((entry) => matches(entry, filter)).sort((a, b) => a[key] - b[key])[0]
		if (row) apply(row, update)
		const snapshot = structuredClone(row)
		return { lean: async () => snapshot }
	},
})
const ok = (data) => ({ ok: true, json: async () => ({ data }) })
const fixture = () => {
	let now = Date.parse('2026-09-15T00:00:00Z')
	const notes = [{
		_id: 'note', notificationId: 'NOT-1', recipientId: 'PNP-1',
		title: 'Backup requested', message: 'Please respond', priority: 'high',
		referenceType: 'task', referenceId: 'TSK-1', data: { taskInbox: true },
		pushQueuePending: true, createdAt: new Date(now),
	}]
	const deviceRows = [{
		expoPushToken: 'ExponentPushToken[device-1]', personnelId: 'PNP-1',
		status: 'active', lastSeenAt: new Date(now - 1000),
	}]
	const jobs = []
	const calls = []
	let responder = async (url) => ok(url.endsWith('/send') ? [{ status: 'ok', id: 'ticket-1' }] : { 'ticket-1': { status: 'ok' } })
	const stores = { notifications: collection(notes), devices: collection(deviceRows), deliveries: collection(jobs) }
	const worker = () => createPushDeliveryService({
		...stores, clock: () => now, logger: { error() {}, warn() {} }, accessToken: 'test-token',
		fetchImpl: async (url, options) => {
			calls.push({ url, body: JSON.parse(options.body), options })
			return responder(url, options)
		},
	})
	return {
		notes, deviceRows, jobs, calls, stores, worker,
		advance: (ms) => { now += ms },
		respond: (fn) => { responder = fn },
	}
}

it('persists tickets, resumes after a worker restart, and checks the final receipt', async () => {
	const f = fixture()
	await f.worker().runOnce()
	assert.equal(f.notes[0].pushQueuePending, false)
	assert.equal(f.jobs[0].status, 'awaiting_receipt')
	assert.equal(f.jobs[0].ticketId, 'ticket-1')
	assert.equal(f.calls[0].body[0].data.notificationId, 'NOT-1')
	assert.equal(f.calls[0].body[0].channelId, 'officer-alerts')
	assert.equal(f.calls[0].body[0].priority, 'high')
	assert.equal(f.calls[0].options.headers.Authorization, 'Bearer test-token')
	assert.ok(f.calls[0].options.signal instanceof AbortSignal)
	await f.worker().runOnce()
	assert.equal(f.calls.length, 1)
	f.advance(RECEIPT_DELAY_MS)
	await f.worker().runOnce()
	assert.deepEqual(f.calls[1].body, { ids: ['ticket-1'] })
	assert.equal(f.jobs[0].status, 'provider_accepted')
	assert.ok(f.jobs[0].purgeAt > f.jobs[0].completedAt)
	await f.worker().runOnce()
	assert.equal(f.calls.length, 2)
})

for (const stage of ['ticket', 'receipt']) {
	it(`invalidates DeviceNotRegistered from a ${stage} and stops retrying`, async () => {
		const f = fixture()
		if (stage === 'receipt') { await f.worker().runOnce(); f.advance(RECEIPT_DELAY_MS) }
		const failure = { status: 'error', details: { error: 'DeviceNotRegistered' } }
		f.respond(async () => ok(stage === 'ticket' ? [failure] : { 'ticket-1': failure }))
		await f.worker().runOnce()
		assert.equal(f.deviceRows[0].status, 'invalid')
		assert.equal(f.jobs[0].status, 'failed')
		assert.equal(f.jobs[0].lastError, 'DeviceNotRegistered')
		const count = f.calls.length
		f.advance(DELIVERY_WINDOW_MS)
		await f.worker().runOnce()
		assert.equal(f.calls.length, count)
	})
}

for (const failure of [429, 503, 'network', 'malformed', 'rate']) {
	it(`backs off and recovers from ${failure} send failure`, async () => {
		const f = fixture()
		f.respond(async () => {
			if (failure === 'network') throw new Error('Offline')
			if (failure === 'malformed') return ok([])
			if (failure === 'rate') return ok([{ status: 'error', details: { error: 'MessageRateExceeded' } }])
			return { ok: false, status: failure }
		})
		await f.worker().runOnce()
		assert.equal(f.jobs[0].status, 'pending')
		await f.worker().runOnce()
		assert.equal(f.calls.length, 1)
		f.advance(30_000)
		f.respond(async () => ok([{ status: 'ok', id: 'retry-ticket' }]))
		await f.worker().runOnce()
		assert.equal(f.jobs[0].attempts, 2)
		assert.equal(f.jobs[0].ticketId, 'retry-ticket')
	})
}

it('bounds repeated send failures to five attempts with increasing retry delay', async () => {
	const f = fixture()
	f.respond(async () => ({ ok: false, status: 503 }))
	await f.worker().runOnce()
	for (const delay of [30_000, 60_000, 120_000, 240_000]) {
		f.advance(delay - 1)
		const count = f.calls.length
		await f.worker().runOnce()
		assert.equal(f.calls.length, count)
		f.advance(1)
		await f.worker().runOnce()
	}
	assert.equal(f.calls.length, 5)
	assert.equal(f.jobs[0].status, 'failed')
})

for (const error of ['MessageTooBig', 'InvalidCredentials', 'MismatchSenderId', 400, 401]) {
	it(`records permanent ${error} failures without retrying or invalidating the device`, async () => {
		const f = fixture()
		f.respond(async () => typeof error === 'number'
			? { ok: false, status: error }
			: ok([{ status: 'error', details: { error } }]))
		await f.worker().runOnce()
		assert.equal(f.jobs[0].status, 'failed')
		assert.equal(f.deviceRows[0].status, 'active')
		f.advance(60_000)
		await f.worker().runOnce()
		assert.equal(f.calls.length, 1)
	})
}

it('polls missing receipts without resending and eventually records an unknown outcome', async () => {
	const f = fixture()
	await f.worker().runOnce()
	f.respond(async () => ok({}))
	for (let index = 0; index < 12; index += 1) {
		f.advance(60 * 60_000)
		await f.worker().runOnce()
	}
	assert.equal(f.calls.filter((call) => call.url.endsWith('/send')).length, 1)
	assert.equal(f.jobs[0].status, 'unknown')
	assert.equal(f.jobs[0].receiptChecks, 12)
})

it('retries receipt HTTP errors against the original ticket, then recovers', async () => {
	const f = fixture()
	await f.worker().runOnce()
	f.advance(RECEIPT_DELAY_MS)
	f.respond(async () => ({ ok: false, status: 503 }))
	await f.worker().runOnce()
	assert.equal(f.jobs[0].status, 'awaiting_receipt')
	f.advance(RECEIPT_DELAY_MS)
	f.respond(async () => ok({ 'ticket-1': { status: 'ok' } }))
	await f.worker().runOnce()
	assert.equal(f.jobs[0].status, 'provider_accepted')
	assert.equal(f.calls.filter((call) => call.url.endsWith('/send')).length, 1)
})

it('retries an explicit transient receipt failure with a new send and ticket', async () => {
	const f = fixture()
	await f.worker().runOnce()
	f.advance(RECEIPT_DELAY_MS)
	f.respond(async () => ok({ 'ticket-1': { status: 'error', details: { error: 'MessageRateExceeded' } } }))
	await f.worker().runOnce()
	assert.equal(f.jobs[0].status, 'pending')
	f.advance(30_000)
	f.respond(async () => ok([{ status: 'ok', id: 'second-ticket' }]))
	await f.worker().runOnce()
	assert.equal(f.jobs[0].ticketId, 'second-ticket')
	assert.equal(f.jobs[0].attempts, 2)
})

it('recovers partial enqueue failure without duplicating delivery rows', async () => {
	const f = fixture()
	f.deviceRows.push({ ...f.deviceRows[0], expoPushToken: 'ExponentPushToken[device-2]' })
	const update = f.stores.deliveries.updateOne
	let fail = true
	f.stores.deliveries.updateOne = async (filter, ...args) => {
		if (fail && filter.expoPushToken?.includes('device-2')) throw new Error('DB unavailable')
		return update(filter, ...args)
	}
	await f.worker().runOnce()
	assert.equal(f.notes[0].pushQueuePending, true)
	assert.equal(f.jobs.length, 1)
	fail = false
	await f.worker().runOnce()
	assert.equal(f.notes[0].pushQueuePending, false)
	assert.equal(f.jobs.length, 2)
	assert.equal(f.calls.filter((call) => call.url.endsWith('/send')).length, 2)
})

it('concurrent workers enqueue once and only one claims a delivery', async () => {
	const f = fixture()
	await Promise.all([f.worker().runOnce(), f.worker().runOnce()])
	assert.equal(f.jobs.length, 1)
	assert.equal(f.calls.length, 1)
})

it('recovers an expired lease after restart and prevents a stale worker overwriting its result', async () => {
	const f = fixture()
	let release
	let started
	const waiting = new Promise((resolve) => { started = resolve })
	f.respond(() => { started(); return new Promise((resolve) => { release = resolve }) })
	const first = f.worker().runOnce()
	await waiting
	await f.worker().runOnce()
	assert.equal(f.calls.length, 1)
	f.advance(LEASE_MS + 1)
	f.respond(async () => ok([{ status: 'ok', id: 'recovered-ticket' }]))
	await f.worker().runOnce()
	release(ok([{ status: 'ok', id: 'stale-ticket' }]))
	await first
	assert.equal(f.jobs[0].ticketId, 'recovered-ticket')
	assert.equal(f.jobs[0].attempts, 2)
})

for (const change of ['revoked', 'reassigned']) {
	it(`cancels retries when a device is ${change}`, async () => {
		const f = fixture()
		f.respond(async () => ({ ok: false, status: 503 }))
		await f.worker().runOnce()
		if (change === 'revoked') f.deviceRows[0].status = 'revoked'
		else f.deviceRows[0].personnelId = 'PNP-2'
		f.advance(30_000)
		await f.worker().runOnce()
		assert.equal(f.jobs[0].status, 'cancelled')
		assert.equal(f.calls.length, 1)
	})
}

it('does not invalidate a token re-registered after the failed push was sent', async () => {
	const f = fixture()
	await f.worker().runOnce()
	f.deviceRows[0].lastSeenAt = new Date(+f.jobs[0].ticketCreatedAt + 1000)
	f.advance(RECEIPT_DELAY_MS)
	f.respond(async () => ok({ 'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } }))
	await f.worker().runOnce()
	assert.equal(f.deviceRows[0].status, 'active')
	assert.equal(f.jobs[0].status, 'failed')
})

it('does not replay old notifications or enqueue pushes without an active device', async () => {
	const f = fixture()
	f.advance(DELIVERY_WINDOW_MS)
	await f.worker().runOnce()
	assert.equal(f.jobs.length, 0)
	assert.equal(f.notes[0].pushQueuePending, false)
	const noDevice = fixture()
	noDevice.deviceRows.length = 0
	await noDevice.worker().runOnce()
	assert.equal(noDevice.jobs.length, 0)
	assert.equal(noDevice.notes[0].pushQueuePending, false)
})
