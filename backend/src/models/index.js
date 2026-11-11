const authModels = require('./authModels')
const auditModels = require('./auditModels')
const notificationModels = require('./notificationModels')
const operationalModels = require('./operationalModels')
const personnelModels = require('./personnelModels')
const patrolModels = require('./patrolModels')

module.exports = {
	...authModels,
	...personnelModels,
	...operationalModels,
	...notificationModels,
	...auditModels,
	...patrolModels,
}
