import { describe, expect, it } from 'vitest'
import { meetsPasswordRequirements } from '../../utils/accountValidation'
import { createTempPassword } from './accountPresentation'

describe('temporary password generation', () => {
  it('always satisfies the account password policy', () => {
    for (let index = 0; index < 250; index += 1) {
      const password = createTempPassword()
      expect(password).toHaveLength(12)
      expect(meetsPasswordRequirements(password)).toBe(true)
    }
  })

  it('enforces the supported password length range', () => {
    expect(createTempPassword(4)).toHaveLength(10)
    expect(createTempPassword(200)).toHaveLength(128)
  })
})
