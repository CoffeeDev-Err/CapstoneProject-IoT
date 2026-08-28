const { createHash } = require('crypto')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const contracts = require('../../contracts/domain-contracts.json')
const { CABAGAN_BARANGAYS } = require('../src/constants/cabaganBarangays')
const {
	CABAGAN_BOUNDARY_COORDS,
	isInsideCabagan,
} = require('../src/utils/cabaganGeofence')
const {
	validateBadgeNumber,
	validateFullName,
	validateLoginId,
	validateMobileNumber,
} = require('../src/utils/accountValidation')

const isValid = (validator, value, options) => validator(value, options) === ''

describe('cross-platform domain contracts', () => {
	it('keeps the backend barangay catalog canonical', () => {
		assert.deepEqual(CABAGAN_BARANGAYS, contracts.barangays)
	})

	it('keeps the municipal geofence unchanged', () => {
		const digest = createHash('sha256')
			.update(JSON.stringify(CABAGAN_BOUNDARY_COORDS))
			.digest('hex')
		assert.equal(CABAGAN_BOUNDARY_COORDS.length, contracts.geofence.coordinateCount)
		assert.equal(digest, contracts.geofence.sha256)
		for (const probe of contracts.geofence.probes) {
			assert.equal(isInsideCabagan(probe.latitude, probe.longitude), probe.inside)
		}
	})

	it('keeps account validation behavior aligned with contract cases', () => {
		for (const testCase of contracts.validationCases.fullName) {
			assert.equal(isValid(validateFullName, testCase.value), testCase.valid)
		}
		for (const testCase of contracts.validationCases.badgeNumber) {
			assert.equal(isValid(validateBadgeNumber, testCase.value), testCase.valid)
		}
		for (const testCase of contracts.validationCases.officerLoginId) {
			assert.equal(
				isValid(validateLoginId, testCase.value, { accountType: 'officer' }),
				testCase.valid,
			)
		}
		for (const testCase of contracts.validationCases.mobileNumber) {
			assert.equal(isValid(validateMobileNumber, testCase.value), testCase.valid)
		}
	})

	it('defines canonical API and socket payload fixtures', () => {
		assert.equal(contracts.apiPayloads.deployment.id, 'DEP-CONTRACT-001')
		assert.equal(contracts.apiPayloads.task.id, 'TSK-CONTRACT-001')
		assert.equal(contracts.apiPayloads.report.id, 'RPT-CONTRACT-001')
		for (const eventName of Object.keys(contracts.socketPayloads)) {
			assert.ok(contracts.socketEvents.includes(eventName))
		}
	})
})
