const assert = require('assert/strict')
const { buildMockDeploymentSeedUpdate } = require('../src/services/seedService')

const seedUpdate = buildMockDeploymentSeedUpdate()

assert.equal(seedUpdate.$set, undefined)
assert.equal(seedUpdate.$unset, undefined)
assert.equal(seedUpdate.$setOnInsert.assignmentId, 'ASG-CENTRO-002')
assert.equal(seedUpdate.$setOnInsert.status, 'active')

console.log('Backend deployment lifecycle checks passed.')
