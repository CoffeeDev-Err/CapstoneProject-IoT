const createAnalyticsController = (analyticsService) => ({
	getOperationalAnalytics: async (req, res) => {
		res.json(await analyticsService.buildOperationalAnalytics(req.query))
	},

	getDashboardSummary: async (_req, res) => {
		res.json(await analyticsService.getDashboardSummary())
	},
})

module.exports = createAnalyticsController
