const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { findPatrolArea } = require('../src/constants/patrolAreas')
const { serializeDeployment } = require('../src/services/operations/domain')

describe('patrol area catalog', () => {
	it('keeps a barangay-wide assignment separate from a fixed deployment point', () => {
		const magassi = findPatrolArea('Barangay Magassi')
		assert.equal(magassi.id, 'barangay-magassi')
		assert.equal(magassi.defaultDeploymentType, 'area')
		assert.deepEqual(magassi.coverageBarangayCodes, ['MAGASSI'])
	})

	it('maps the public market zone to its coverage barangay', () => {
		const market = findPatrolArea('cabagan-public-market-zone')
		assert.equal(market.name, 'Cabagan Public Market Zone')
		assert.equal(market.defaultDeploymentType, 'point')
		assert.deepEqual(market.coverageBarangayCodes, ['CENTRO'])
	})

	it('does not invent a single barangay for a multi-barangay route', () => {
		const route = findPatrolArea('Cabagan-Santa Maria Road')
		assert.equal(route.category, 'route')
		assert.deepEqual(route.coverageBarangayCodes, [])
	})
})

describe('deployment serialization', () => {
	it('returns no coordinates for an area patrol without an explicit point', () => {
		const serialized = serializeDeployment({
			assignmentId: 'ASG-001',
			groupId: 'GRP-001',
			personnelId: 'PNP-001',
			personnelName: 'Officer One',
			rank: 'Patrolman',
			patrolAreaId: 'barangay-magassi',
			patrolArea: 'Barangay Magassi',
			deploymentType: 'area',
			coverageBarangayCodes: ['MAGASSI'],
			instructions: '',
			status: 'active',
		})

		assert.equal(serialized.barangay, 'Magassi')
		assert.equal(serialized.hasDeploymentPoint, false)
		assert.equal(serialized.latitude, null)
		assert.equal(serialized.longitude, null)
	})

	it('returns the exact fixed-post coordinates and label', () => {
		const serialized = serializeDeployment({
			assignmentId: 'ASG-002',
			groupId: 'GRP-002',
			personnelId: 'PNP-001',
			personnelName: 'Officer One',
			rank: 'Patrolman',
			patrolAreaId: 'cabagan-public-market-zone',
			patrolArea: 'Cabagan Public Market Zone',
			deploymentType: 'point',
			deploymentPointLabel: 'Main entrance',
			coverageBarangayCodes: ['CENTRO'],
			location: { type: 'Point', coordinates: [121.7658, 17.4272] },
			instructions: '',
			status: 'active',
		})

		assert.equal(serialized.hasDeploymentPoint, true)
		assert.equal(serialized.deploymentPointLabel, 'Main entrance')
		assert.equal(serialized.latitude, 17.4272)
		assert.equal(serialized.longitude, 121.7658)
	})
})
