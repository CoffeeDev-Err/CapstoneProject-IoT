// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import contracts from '../../../contracts/domain-contracts.json'
import { CABAGAN_BARANGAYS } from '../constants/cabaganBarangays'
import {
  CABAGAN_BOUNDARY_COORDS,
  isInsideCabagan,
} from './cabaganGeofence'
import {
  validateBadgeNumber,
  validateFullName,
  validateLoginId,
  validateMobileNumber,
  validateOfficialEmail,
} from './accountValidation'

const isValid = (validator, value, options) => validator(value, options) === ''

describe('cross-platform domain contracts', () => {
  it('keeps barangays and the geofence aligned', () => {
    expect(CABAGAN_BARANGAYS).toEqual(contracts.barangays.map(({ name }) => name))
    expect(CABAGAN_BOUNDARY_COORDS).toHaveLength(contracts.geofence.coordinateCount)
    expect(createHash('sha256').update(JSON.stringify(CABAGAN_BOUNDARY_COORDS)).digest('hex'))
      .toBe(contracts.geofence.sha256)
    contracts.geofence.probes.forEach((probe) => {
      expect(isInsideCabagan(probe.latitude, probe.longitude)).toBe(probe.inside)
    })
  })

  it('keeps account validation aligned', () => {
    contracts.validationCases.fullName.forEach(({ value, valid }) => {
      expect(isValid(validateFullName, value)).toBe(valid)
    })
    contracts.validationCases.badgeNumber.forEach(({ value, valid }) => {
      expect(isValid(validateBadgeNumber, value)).toBe(valid)
    })
    contracts.validationCases.officerLoginId.forEach(({ value, valid }) => {
      expect(isValid(validateLoginId, value, { accountType: 'officer' })).toBe(valid)
    })
    contracts.validationCases.officialEmail.forEach(({ value, valid }) => {
      expect(isValid(validateOfficialEmail, value)).toBe(valid)
    })
    contracts.validationCases.mobileNumber.forEach(({ value, valid }) => {
      expect(isValid(validateMobileNumber, value)).toBe(valid)
    })
  })
})
