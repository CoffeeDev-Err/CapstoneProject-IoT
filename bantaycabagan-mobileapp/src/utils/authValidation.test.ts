import { validateRecoveryIdentifier } from './authValidation';

describe('mobile authentication input validation', () => {
  it('flags a known mistyped email domain before requesting a recovery code', () => {
    expect(validateRecoveryIdentifier('officer@ggmail.com'))
      .toBe('Check the email domain. Did you mean officer@gmail.com?');
  });

  it('keeps valid official email domains available', () => {
    expect(validateRecoveryIdentifier('officer@pnp.gov.ph')).toBe('');
    expect(validateRecoveryIdentifier('officer@gmail.com')).toBe('');
  });

  it('rejects invalid periods in the email username', () => {
    expect(validateRecoveryIdentifier('officer..name@gmail.com')).toContain('consecutive periods');
    expect(validateRecoveryIdentifier('.officer@gmail.com')).toContain('cannot start or end');
    expect(validateRecoveryIdentifier('officer.@gmail.com')).toContain('cannot start or end');
  });
});
