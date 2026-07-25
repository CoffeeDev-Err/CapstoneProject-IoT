const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parsePagination = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
	const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
	const limit = Math.min(
		maxLimit,
		Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit),
	)
	return {
		page,
		limit,
		skip: (page - 1) * limit,
	}
}

const createPaginationMeta = ({ page, limit, total }) => ({
	page,
	limit,
	total,
	totalPages: Math.max(1, Math.ceil(total / limit)),
	hasNextPage: page * limit < total,
	hasPreviousPage: page > 1,
})

const buildDateRange = (from, to) => {
	const range = {}
	if (from) {
		const date = new Date(from)
		if (!Number.isNaN(date.getTime())) range.$gte = date
	}
	if (to) {
		const date = new Date(to)
		if (!Number.isNaN(date.getTime())) range.$lte = date
	}
	return Object.keys(range).length > 0 ? range : undefined
}

module.exports = {
	buildDateRange,
	createPaginationMeta,
	escapeRegex,
	parsePagination,
}
