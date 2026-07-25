const createAuditController = (auditService) => ({
	getAuditLogs: async (req, res) => {
		res.json(await auditService.listAuditLogs(req.query))
	},
})

module.exports = createAuditController
