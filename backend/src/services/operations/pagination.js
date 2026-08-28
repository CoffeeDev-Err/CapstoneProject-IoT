const appendFilterCondition = (filter, condition) => {
	filter.$and = [...(filter.$and || []), condition]
}

const encodeCursor = (document, dateField) => Buffer.from(JSON.stringify({
	date: document[dateField]?.toISOString(),
	id: String(document._id),
})).toString('base64url')

const decodeCursor = (cursor) => {
	if (!cursor) return null
	try {
		const payload = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
		const date = new Date(payload.date)
		if (Number.isNaN(date.getTime()) || !/^[a-f\d]{24}$/i.test(payload.id)) return null
		return { date, id: payload.id }
	} catch {
		return null
	}
}

const findCursorPage = async ({ model, filter, dateField, limit, cursor }) => {
	const decodedCursor = decodeCursor(cursor)
	if (cursor && !decodedCursor) {
		const error = new Error('Invalid pagination cursor.')
		error.status = 400
		throw error
	}
	if (decodedCursor) {
		appendFilterCondition(filter, {
			$or: [
				{ [dateField]: { $lt: decodedCursor.date } },
				{ [dateField]: decodedCursor.date, _id: { $lt: decodedCursor.id } },
			],
		})
	}

	const documents = await model.find(filter)
		.sort({ [dateField]: -1, _id: -1 })
		.limit(limit + 1)
		.lean()
	const hasNextPage = documents.length > limit
	const data = hasNextPage ? documents.slice(0, limit) : documents
	return {
		data,
		pagination: {
			limit,
			hasNextPage,
			nextCursor: hasNextPage && data.length > 0
				? encodeCursor(data[data.length - 1], dateField)
				: null,
		},
	}
}

const createPersonnelLoader = (Personnel) => async (personnelIds = []) => {
	const uniqueIds = [...new Set(personnelIds.filter(Boolean))]
	if (uniqueIds.length === 0) return new Map()
	const profiles = await Personnel.find({ personnelId: { $in: uniqueIds } })
		.select('personnelId fullName rank')
		.lean()
	return new Map(profiles.map((profile) => [profile.personnelId, profile]))
}

module.exports = {
	appendFilterCondition,
	createPersonnelLoader,
	decodeCursor,
	encodeCursor,
	findCursorPage,
}
