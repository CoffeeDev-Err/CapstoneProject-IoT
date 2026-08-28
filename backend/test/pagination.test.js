const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
	decodeCursor,
	encodeCursor,
	findCursorPage,
} = require('../src/services/operations/pagination')

describe('operational cursor pagination', () => {
	it('rejects malformed cursors before querying the database', async () => {
		let queried = false
		const model = { find: () => { queried = true } }

		await assert.rejects(
			findCursorPage({
				model,
				filter: {},
				dateField: 'submittedAt',
				limit: 20,
				cursor: 'not-a-valid-cursor',
			}),
			(error) => error.status === 400 && /invalid pagination cursor/i.test(error.message),
		)
		assert.equal(queried, false)
	})

	it('returns a stable next cursor without exposing the look-ahead row', async () => {
		const documents = [
			{ _id: '64f000000000000000000001', submittedAt: new Date('2026-08-28T10:00:00Z') },
			{ _id: '64f000000000000000000002', submittedAt: new Date('2026-08-28T09:00:00Z') },
			{ _id: '64f000000000000000000003', submittedAt: new Date('2026-08-28T08:00:00Z') },
		]
		const model = {
			find: () => ({
				sort: () => ({
					limit: () => ({ lean: async () => documents }),
				}),
			}),
		}

		const page = await findCursorPage({
			model,
			filter: {},
			dateField: 'submittedAt',
			limit: 2,
		})

		assert.equal(page.data.length, 2)
		assert.equal(page.pagination.hasNextPage, true)
		assert.deepEqual(decodeCursor(page.pagination.nextCursor), {
			date: documents[1].submittedAt,
			id: String(documents[1]._id),
		})
		assert.equal(
			page.pagination.nextCursor,
			encodeCursor(documents[1], 'submittedAt'),
		)
	})
})
