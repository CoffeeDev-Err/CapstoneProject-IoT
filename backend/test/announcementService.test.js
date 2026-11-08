const assert = require('node:assert/strict')
const { it } = require('node:test')
const express = require('express')
const request = require('supertest')
const { createAnnouncementService, normalizeAnnouncement, announcementMessage } = require('../src/services/announcementService')
const createRoutes = require('../src/routes/notificationRoutes')
const createController = require('../src/controllers/notificationController')
const errorHandler = require('../src/middleware/errorHandler')

const actor = { _id: 'supervisor-one', role: 'supervisor' }
const input = { request_id: 'test-request-123456', message: 'Please attend the briefing.', location: 'Station', when: 'immediately' }
const query = data => ({ select() { return this }, sort() { return this }, limit() { return this }, lean: async () => structuredClone(data) })
const fixture = () => {
	const records = new Map(), notifications = new Map(), filters = []
	let failRecipient = null
	const models = {
		PersonnelAnnouncement: {
			findById: id => query(records.get(id)),
			find: () => query([...records.values()].filter(record => !record.completedAt)),
			create: async record => {
				if (records.has(record._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 })
				records.set(record._id, structuredClone(record)); return record
			},
			updateOne: async (filter, update) => {
				const record = records.get(filter._id)
				if (filter.pendingRecipientIds && record.pendingRecipientIds.length) return
				if (update.$pull) record.pendingRecipientIds = record.pendingRecipientIds.filter(id => id !== update.$pull.pendingRecipientIds)
				Object.assign(record, update.$set)
			},
		},
		User: { find: filter => { filters.push(filter); return query([{ personnelId: 'on-duty' }, { personnelId: 'off-duty' }, { personnelId: 'inactive-profile' }]) } },
		Personnel: { find: filter => { filters.push(filter); return query([{ personnelId: 'on-duty' }, { personnelId: 'off-duty' }]) } },
	}
	const service = createAnnouncementService({ models, clock: () => new Date('2026-11-08T00:00:00Z'), logger: { error() {} },
		deliverNotification: async payload => {
			if (payload.recipientId === failRecipient) throw new Error('Temporary database failure')
			const key = `${payload.recipientId}:${payload.dedupeKey}`
			if (!notifications.has(key)) notifications.set(key, payload)
		},
	})
	return { service, records, notifications, filters, models, fail: id => { failRecipient = id } }
}

it('queues all active real police accounts, including off-duty, with independent inbox recipients', async () => {
	const f = fixture()
	const result = await f.service.submit({ ...input, recipientIds: ['spoof'], title: 'Spoof' }, actor)
	assert.equal(result.recipientCount, 2)
	assert.equal(result.status, 'queued')
	assert.deepEqual(f.filters[0], { role: 'officer', status: 'active', isMockAccount: { $ne: true } })
	assert.equal(f.filters[1].status, 'active')
	await f.service.runOnce()
	assert.deepEqual([...f.notifications.values()].map(n => n.recipientId), ['on-duty', 'off-duty'])
	for (const n of f.notifications.values()) {
		assert.equal(n.title, 'Personnel announcement')
		assert.equal(n.referenceType, 'announcement')
		assert.equal(n.message, 'Please attend the briefing.\nLocation: Station\nWhen: Immediately')
	}
	assert.ok([...f.records.values()][0].completedAt)
})

it('persists future event announcements immediately and labels event time in PHT', async () => {
	const f = fixture()
	await f.service.submit({ ...input, when: 'scheduled', event_at: '2026-11-09T14:30:00+08:00' }, actor)
	await f.service.runOnce()
	assert.equal(f.notifications.size, 2)
	assert.match([...f.notifications.values()][0].message, /Nov 9, 2026.*2:30 PM PHT/)
})

it('retries failed recipients and does not duplicate accepted requests, including simultaneous submits', async () => {
	const f = fixture()
	const results = await Promise.all([f.service.submit(input, actor), f.service.submit(input, actor)])
	assert.equal(results[0].id, results[1].id)
	assert.equal(f.records.size, 1)
	f.fail('off-duty')
	await f.service.runOnce()
	assert.equal(f.notifications.size, 1)
	assert.deepEqual([...f.records.values()][0].pendingRecipientIds, ['off-duty'])
	f.fail(null)
	await f.service.runOnce()
	await f.service.submit(input, actor)
	await f.service.runOnce()
	assert.equal(f.notifications.size, 2)
	await assert.rejects(f.service.submit({ ...input, message: 'Changed' }, actor), { status: 409 })
})

it('validates message, size, timezone and event time and rejects unauthorized or empty-recipient sends', async () => {
	for (const invalid of [{ message: ' ' }, { message: {} }, { message: 'a'.repeat(601) }, { location: 'x'.repeat(201) },
		{ when: 'other' }, { when: 'scheduled', event_at: '2026-11-09T14:00' }, { request_id: '' },
		{ when: 'scheduled', event_at: '2027-02-30T14:00:00+08:00' }, { when: 'scheduled', event_at: '2026-11-09T24:00:00+08:00' }]) {
		assert.throws(() => normalizeAnnouncement({ ...input, ...invalid }), { status: 400 })
	}
	const f = fixture()
	await assert.rejects(f.service.submit({ ...input, when: 'scheduled', event_at: '2026-11-07T14:00:00+08:00' }, actor), { status: 400 })
	await assert.rejects(f.service.submit(input, { _id: 'officer', role: 'officer' }), { status: 403 })
	f.models.Personnel.find = () => query([])
	await assert.rejects(f.service.submit(input, actor), { status: 409 })
	assert.equal(f.records.size, 0)
})

it('keeps unicode announcements within a conservative push payload size', () => {
	const values = normalizeAnnouncement({ ...input, message: '界'.repeat(600), location: '界'.repeat(200) })
	const payload = { to: 'ExponentPushToken[' + 'a'.repeat(40) + ']', body: announcementMessage(values),
		title: 'Personnel announcement', data: { notificationId: 'NOT-' + 'a'.repeat(36), referenceType: 'announcement', referenceId: 'a'.repeat(110) } }
	assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 3500)
})

it('recovers an unfinished fan-out with a fresh service instance after a restart', async () => {
	const f = fixture()
	await f.service.submit(input, actor)
	f.fail('off-duty'); await f.service.runOnce()
	const resumed = createAnnouncementService({ models: f.models, deliverNotification: async payload => {
		assert.equal(payload.recipientId, 'off-duty')
		f.notifications.set(`${payload.recipientId}:${payload.dedupeKey}`, payload)
	} })
	await resumed.runOnce()
	assert.equal(f.notifications.size, 2)
	assert.ok([...f.records.values()][0].completedAt)
})

it('allows only authenticated supervisors through the announcement route', async () => {
	let received
	const app = express(); app.use(express.json())
	app.use('/api/notifications', createRoutes({ authService: { authenticate: async token => {
		if (!['supervisor', 'officer'].includes(token)) throw Object.assign(new Error('Authentication required'), { status: 401 })
		return { user: { _id: 'authenticated', role: token } }
	} }, controller: createController({}, { submit: async (body, user) => {
		received = { body, user }; return { id: 'one', recipientCount: 2, status: 'queued' }
	}, runOnce: async () => {} }) }))
	app.use(errorHandler)
	await request(app).post('/api/notifications/announcements').send(input).expect(401)
	await request(app).post('/api/notifications/announcements').set('Authorization', 'Bearer officer').send(input).expect(403)
	const result = await request(app).post('/api/notifications/announcements').set('Authorization', 'Bearer supervisor').send(input).expect(202)
	assert.equal(received.user._id, 'authenticated')
	assert.equal(result.body.announcement.recipientCount, 2)
})
